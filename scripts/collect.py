#!/usr/bin/env python3
"""Conservative official-source collector. Never bypasses login, CAPTCHA or access controls."""
from __future__ import annotations
import hashlib, json, os, re, sys, time, uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

TZ = timezone(timedelta(hours=8))
USER_AGENT = "HomeCompass/1.0 (+private research dashboard; respectful daily polling)"
SOURCES = {
    "nbs-70": "https://www.stats.gov.cn/sj/zxfbhjd/202608/t20260817_1965050.html",
    "nbs-national": "https://www.stats.gov.cn/sj/zxfb/202608/t20260817_1965053.html",
    "lpr": "https://www.chinamoney.com.cn/chinese/rdgz/20260820/3399885.html",
    "nj-house": "https://www.njhouse.com.cn/projectindex.html",
    "hz-tmsf": "https://www.tmsf.com/yhweb/",
}

def fetch(url: str, retries: int = 2) -> tuple[str, int]:
    error = None
    for attempt in range(retries + 1):
        try:
            with urlopen(Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html"}), timeout=25) as response:
                return response.read().decode("utf-8", "replace"), response.status
        except (HTTPError, URLError, TimeoutError) as exc:
            error = exc
            if isinstance(exc, HTTPError) and exc.code in (401, 403, 405, 429):
                break
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"source unavailable without bypass: {error}")

def strip_html(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", value)).strip()

def parse_nanjing(text: str) -> dict[str, float | int]:
    plain = re.sub(r"\s+", "", strip_html(text))
    patterns = {
        "today_recognition": r"(?:今日)?认购([\d,]+)(?:套)?", "today_transactions": r"(?:今日)?成交([\d,]+)(?:套)?",
        "month_listing_area": r"本月上市(?:面积)?([\d.]+)", "month_transaction_area": r"本月成交(?:面积)?([\d.]+)",
        "year_listing_area": r"本年上市(?:面积)?([\d.]+)", "year_transaction_area": r"本年成交(?:面积)?([\d.]+)",
    }
    result: dict[str, float | int] = {}
    for key, pattern in patterns.items():
        match = re.search(pattern, plain)
        if match: result[key] = float(match.group(1).replace(",", "")) if "." in match.group(1) else int(match.group(1).replace(",", ""))
    if "month_transaction_area" not in result: raise ValueError("Nanjing page shape changed: monthly transaction area missing")
    return result

def parse_lpr(text: str) -> float:
    plain = re.sub(r"\s+", "", strip_html(text))
    match = re.search(r"5年期以上LPR为([\d.]+)%", plain)
    if not match: raise ValueError("LPR page shape changed")
    return float(match.group(1))

def canonical(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))

def api_json(url: str, token: str | None = None, payload: dict | None = None) -> dict:
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    data = None
    if payload is not None:
        headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    with urlopen(Request(url, headers=headers, data=data, method="POST" if payload else "GET"), timeout=30) as response:
        return json.loads(response.read())

def main() -> int:
    base = os.environ.get("INGEST_URL", "").rstrip("/")
    token = os.environ.get("INGEST_TOKEN")
    if not base or not token:
        print("INGEST_URL and INGEST_TOKEN are required", file=sys.stderr); return 2
    now = datetime.now(TZ); day = now.strftime("%Y-%m-%d"); archive = Path("data/archive") / now.strftime("%Y/%m/%d"); archive.mkdir(parents=True, exist_ok=True)
    dashboards = [api_json(f"{base}/api/dashboard?city={city}&range=60")["data"] for city in ("hangzhou", "nanjing")]
    health = {}
    raw = {}
    for source_id, url in SOURCES.items():
        try:
            raw[source_id], status = fetch(url); health[source_id] = {"status": "verified", "http": status}
        except Exception as exc:
            health[source_id] = {"status": "stale", "error": str(exc)}
    if "nj-house" in raw:
        try:
            nj = parse_nanjing(raw["nj-house"])
            target = next(item for item in dashboards if item["city"] == "nanjing")
            metric = next(item for item in target["metrics"] if item["sourceId"] == "nj-house")
            metric.update({"value": f'{nj["month_transaction_area"]:.2f} 万㎡', "delta": f'年度累计 {nj.get("year_transaction_area", 0):.2f} 万㎡', "quality": "verified"})
        except Exception as exc: health["nj-house"] = {"status": "stale", "error": str(exc)}
    if "lpr" in raw:
        try:
            rate = parse_lpr(raw["lpr"])
            for dashboard in dashboards:
                next(item for item in dashboard["metrics"] if item["sourceId"] == "lpr")["value"] = f"{rate:.2f}%"
        except Exception as exc: health["lpr"] = {"status": "stale", "error": str(exc)}
    for dashboard in dashboards:
        dashboard["observedAt"] = day
        for source in dashboard["sources"]:
            source["collectedAt"] = now.isoformat()
            if source["id"] in health: source["quality"] = health[source["id"]]["status"]
        for metric in dashboard["metrics"]:
            if metric["sourceId"] in health: metric["quality"] = health[metric["sourceId"]]["status"]
    for source_id, text in raw.items(): (archive / f"{source_id}.html").write_text(text, encoding="utf-8")
    (archive / "health.json").write_text(json.dumps(health, ensure_ascii=False, indent=2), encoding="utf-8")
    projects = [project for dashboard in dashboards for project in dashboard.get("projects", [])]
    content = {"dashboards": dashboards, "projects": projects}
    payload = {"schema_version": 1, "run_id": f"{day}-{uuid.uuid4().hex[:12]}", "observed_at": now.isoformat(), "checksum": hashlib.sha256(canonical(content).encode()).hexdigest(), **content}
    result = api_json(f"{base}/api/ingest/v1/snapshots", token, payload)
    (archive / "run.json").write_text(json.dumps({"payload_meta": {k: payload[k] for k in ("schema_version", "run_id", "observed_at", "checksum")}, "result": result}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False)); return 0

if __name__ == "__main__": raise SystemExit(main())
