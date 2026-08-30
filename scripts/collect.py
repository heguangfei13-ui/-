#!/usr/bin/env python3
"""Conservative official-source collector. Never bypasses login, CAPTCHA or access controls."""
from __future__ import annotations
import hashlib, json, os, re, sys, time, uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
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
AMAP_SOURCE_URL = "https://lbs.amap.com/api/webservice/guide/api/newroute"
COMMUTE_CENTERS = {
    "hangzhou": {"未来科技城": "杭州未来科技城", "滨江": "杭州滨江区政府", "钱江新城": "杭州钱江新城"},
    "nanjing": {"河西": "南京河西新城", "软件谷": "南京中国软件谷", "新街口": "南京新街口"},
}
CITY_CODES = {"hangzhou": "0571", "nanjing": "025"}

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

def amap_json(path: str, params: dict[str, str], key: str) -> dict:
    query = urlencode({**params, "key": key})
    try:
        data = api_json(f"https://restapi.amap.com{path}?{query}")
    except Exception as exc:
        # Never archive exception URLs: they can contain the API key.
        raise RuntimeError(f"AMap transport failed: {type(exc).__name__}") from None
    if str(data.get("status")) != "1":
        raise ValueError(f"AMap rejected request: {data.get('infocode', 'unknown')} {data.get('info', '')}")
    return data

def amap_geocode(query: str, city: str, key: str) -> str:
    data = amap_json("/v3/geocode/geo", {"address": query, "city": city}, key)
    geocodes = data.get("geocodes") or []
    if not geocodes or not geocodes[0].get("location"):
        raise ValueError(f"AMap geocode returned no match: {query}")
    return geocodes[0]["location"]

def amap_duration_minutes(route_item: dict) -> int | None:
    raw = (route_item.get("cost") or {}).get("duration") or route_item.get("duration")
    try: return max(1, round(float(raw) / 60))
    except (TypeError, ValueError): return None

def amap_commute(origin: str, destination: str, city_code: str, key: str) -> dict[str, int | None]:
    driving = amap_json("/v5/direction/driving", {"origin": origin, "destination": destination, "show_fields": "cost"}, key)
    transit = amap_json("/v5/direction/transit/integrated", {"origin": origin, "destination": destination, "city1": city_code, "city2": city_code, "show_fields": "cost"}, key)
    drive_paths = (driving.get("route") or {}).get("paths") or []
    transit_paths = (transit.get("route") or {}).get("transits") or []
    transit_item = transit_paths[0] if transit_paths else {}
    segments = transit_item.get("segments") or []
    return {
        "driveMinutes": amap_duration_minutes(drive_paths[0]) if drive_paths else None,
        "transitMinutes": amap_duration_minutes(transit_item),
        "transfers": max(0, len(segments) - 1) if segments else None,
    }

def amap_amenities(location: str, key: str) -> list[dict[str, str]]:
    categories = {"公园水系": "公园", "轨道交通": "地铁站", "商业": "商场", "医院": "医院"}
    results: list[dict[str, str]] = []
    for category, keyword in categories.items():
        data = amap_json("/v5/place/around", {"location": location, "radius": "3000", "keywords": keyword, "page_size": "2"}, key)
        for poi in (data.get("pois") or [])[:2]:
            distance = poi.get("distance")
            results.append({"category": category, "name": poi.get("name", keyword), "distance": f"{distance}米" if distance else "3公里内"})
    return results

def collect_amap(dashboards: list[dict], key: str, now: datetime) -> dict:
    destination_cache: dict[tuple[str, str], str] = {}
    output = {"generatedAt": now.isoformat(), "basisVersion": "AMAP-WEB-V5", "projects": {}}
    for dashboard in dashboards:
        city = dashboard["city"]
        city_name = dashboard["cityName"]
        for label, query in COMMUTE_CENTERS[city].items():
            destination_cache[(city, label)] = amap_geocode(query, city_name, key)
        for project in dashboard.get("projects", []):
            project_query = f'{project["name"]} {project.get("address", "")}'
            try:
                origin = amap_geocode(project_query, city_name, key)
                commutes = []
                for destination, destination_location in destination_cache.items():
                    destination_city, label = destination
                    if destination_city != city: continue
                    route = amap_commute(origin, destination_location, CITY_CODES[city], key)
                    commutes.append({"destination": label, **route})
                output["projects"][project["id"]] = {"location": origin, "amenities": amap_amenities(origin, key), "commutes": commutes}
            except Exception as exc:
                output["projects"][project["id"]] = {"error": str(exc)}
    return output

def apply_amap_cache(dashboards: list[dict], cache: dict, now: datetime) -> tuple[int, int]:
    succeeded = failed = 0
    by_id = cache.get("projects", {})
    for dashboard in dashboards:
        dashboard_succeeded = 0
        for project in dashboard.get("projects", []):
            item = by_id.get(project["id"], {})
            if item.get("commutes"):
                project["commutes"] = item["commutes"]
                project["amenities"] = item.get("amenities", [])
                project["amapLocation"] = item.get("location")
                succeeded += 1; dashboard_succeeded += 1
            else: failed += 1
        dashboard["sources"] = [source for source in dashboard["sources"] if source["id"] != "amap"]
        dashboard["sources"].append({"id": "amap", "name": "高德地图 Web服务", "url": AMAP_SOURCE_URL, "publishedAt": now.strftime("%Y-%m-%d"), "collectedAt": cache.get("generatedAt", now.isoformat()), "basisVersion": cache.get("basisVersion", "AMAP-WEB-V5"), "quality": "verified" if dashboard_succeeded else "stale", "note": "每周刷新 POI、公交与驾车时间；路线会随道路与算法变化。"})
    return succeeded, failed

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
    amap_key = os.environ.get("AMAP_KEY")
    amap_cache_path = Path("data/amap-latest.json")
    if amap_key:
        try:
            should_refresh = not amap_cache_path.exists() or now.weekday() == 6 or os.environ.get("FORCE_AMAP") == "1"
            if should_refresh:
                amap_cache = collect_amap(dashboards, amap_key, now)
                amap_cache_path.parent.mkdir(parents=True, exist_ok=True)
                amap_cache_path.write_text(json.dumps(amap_cache, ensure_ascii=False, indent=2), encoding="utf-8")
            else:
                amap_cache = json.loads(amap_cache_path.read_text(encoding="utf-8"))
            succeeded, failed = apply_amap_cache(dashboards, amap_cache, now)
            health["amap"] = {"status": "verified" if succeeded else "stale", "projects_updated": succeeded, "projects_failed": failed, "refreshed": should_refresh}
        except Exception as exc:
            health["amap"] = {"status": "stale", "error": str(exc).replace(amap_key, '[REDACTED]')}
            for dashboard in dashboards:
                dashboard["sources"] = [source for source in dashboard["sources"] if source["id"] != "amap"]
                dashboard["sources"].append({"id": "amap", "name": "高德地图 Web服务", "url": AMAP_SOURCE_URL, "publishedAt": day, "collectedAt": now.isoformat(), "basisVersion": "AMAP-WEB-V5", "quality": "stale", "note": health["amap"]["error"]})
    for dashboard in dashboards:
        dashboard["observedAt"] = day
        for source in dashboard["sources"]:
            if source["id"] != "amap": source["collectedAt"] = now.isoformat()
            if source["id"] in health: source["quality"] = health[source["id"]]["status"]
        for metric in dashboard["metrics"]:
            if metric["sourceId"] in health: metric["quality"] = health[metric["sourceId"]]["status"]
    for source_id, text in raw.items(): (archive / f"{source_id}.html").write_text(text, encoding="utf-8")
    (archive / "health.json").write_text(json.dumps(health, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"source_health": health}, ensure_ascii=False))
    projects = [project for dashboard in dashboards for project in dashboard.get("projects", [])]
    content = {"dashboards": dashboards, "projects": projects}
    payload = {"schema_version": 1, "run_id": f"{day}-{uuid.uuid4().hex[:12]}", "observed_at": now.isoformat(), "checksum": hashlib.sha256(canonical(content).encode()).hexdigest(), **content}
    result = api_json(f"{base}/api/ingest/v1/snapshots", token, payload)
    (archive / "run.json").write_text(json.dumps({"payload_meta": {k: payload[k] for k in ("schema_version", "run_id", "observed_at", "checksum")}, "result": result}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False)); return 0

if __name__ == "__main__": raise SystemExit(main())
