#!/usr/bin/env python3
"""Conservative official-source collector. Never bypasses login, CAPTCHA or access controls."""
from __future__ import annotations
import hashlib, json, os, re, sys, time, uuid
from html import unescape
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
    return re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", " ", value))).strip()

def parse_nbs_prices(text: str) -> dict:
    """Read the two overall indices, never substitute the size-band tables."""
    title = re.search(r"(20\d{2})年(\d{1,2})月份70个大中城市商品住宅销售价格变动情况", strip_html(text))
    if not title: raise ValueError("NBS price release title missing")
    period = f"{title[1]}-{int(title[2]):02d}"
    tables = []
    for table in re.findall(r"<table\b[^>]*>.*?</table>", text, re.S | re.I):
        values = {}
        for row in re.findall(r"<tr\b[^>]*>.*?</tr>", table, re.S | re.I):
            cells = [re.sub(r"\s+", "", strip_html(cell)) for cell in re.findall(r"<t[dh]\b[^>]*>(.*?)</t[dh]>", row, re.S | re.I)]
            for city in ("杭州", "南京"):
                if city not in cells: continue
                offset = cells.index(city)
                # Overall tables have two cities per row; size-band tables have ten cells.
                if len(cells) != 8: continue
                nums = cells[offset + 1:offset + 4]
                if len(nums) != 3 or not all(re.fullmatch(r"\d{2,3}\.\d", n) for n in nums):
                    raise ValueError("NBS index cells invalid")
                values[city] = [float(n) for n in nums]
        if values: tables.append(values)
    if len(tables) < 2 or any(city not in table for table in tables[:2] for city in ("杭州", "南京")):
        raise ValueError("NBS overall price tables missing")
    return {"period": period, "cities": {city: {"new": tables[0][city], "resale": tables[1][city]} for city in ("杭州", "南京")}}

def apply_nbs_prices(dashboards: list[dict], parsed: dict, now: datetime) -> None:
    for dashboard in dashboards:
        indices = parsed["cities"][dashboard["cityName"]]
        for label, key in (("新房价格环比", "new"), ("二手房价格环比", "resale")):
            mom, yoy, _ = indices[key]
            metric = next(item for item in dashboard["metrics"] if item["label"] == label)
            metric.update(value=f"{mom - 100:+.1f}%", delta=f'{parsed["period"]} · 同比 {yoy - 100:+.1f}%', direction="up" if mom > 100 else "down" if mom < 100 else "flat", quality="verified")
        point = {"period": parsed["period"], "newHomeIndex": indices["new"][0], "resaleIndex": indices["resale"][0], "volume": None, "inventory": None,
                 "basisVersion": "NBS-70CITY-2026" if parsed["period"] >= "2026-01" else "NBS-70CITY-2021", "quality": "verified", "sourceUrl": SOURCES["nbs-70"], "collectedAt": now.isoformat()}
        # Drop legacy illustrative observations lacking per-point provenance.
        prior = [p for p in dashboard.get("series", []) if p.get("quality") == "verified" and p.get("sourceUrl") and (p["period"], p["basisVersion"]) != (point["period"], point["basisVersion"])]
        dashboard["series"] = sorted([*prior, point], key=lambda p: p["period"])

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
    for attempt in range(2):
        time.sleep(0.3 if not attempt else 2)
        try:
            data = api_json(f"https://restapi.amap.com{path}?{query}")
        except Exception as exc:
            raise RuntimeError(f"AMap transport failed at {path}: {type(exc).__name__}") from None
        if str(data.get("status")) == "1": return data
        code = str(data.get("infocode", "unknown"))
        if code == "30001" and attempt == 0: continue
        # Record only the code and endpoint, never arbitrary provider text or URLs with keys.
        raise ValueError(f"AMap rejected request at {path}: {code}")
    raise RuntimeError("AMap request failed")

def amap_geocode(query: str, city: str, key: str, precise: bool = False) -> dict:
    data = amap_json("/v3/geocode/geo", {"address": query, "city": city}, key)
    geocodes = data.get("geocodes") or []
    if not geocodes or not geocodes[0].get("location"):
        raise ValueError(f"AMap geocode returned no match: {query}")
    match = geocodes[0]
    if precise and len(geocodes) != 1: raise ValueError("AMap project location ambiguous")
    if precise and match.get("level") not in {"兴趣点", "门牌号", "小区", "住宅区", "建筑物"}:
        raise ValueError(f"AMap location too broad: {match.get('level', 'unknown')}")
    if match.get("city") not in (city, city + "市"):
        raise ValueError("AMap location city mismatch")
    return {"location": match["location"], "level": match.get("level", "unknown"), "formattedAddress": match.get("formatted_address", ""), "query": query}

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
        "transfers": max(0, sum(bool((s.get("bus") or {}).get("buslines") or (s.get("bus") or {}).get("busline") or (s.get("bus") or {}).get("steps") or (s.get("railway") or {}).get("id")) for s in segments) - 1) if segments else None,
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
    output = {"generatedAt": now.isoformat(), "basisVersion": "AMAP-WEB-V5-LOCATION-V2", "projects": {}}
    for dashboard in dashboards:
        city = dashboard["city"]
        city_name = dashboard["cityName"]
        for label, query in COMMUTE_CENTERS[city].items():
            destination_cache[(city, label)] = amap_geocode(query, city_name, key)["location"]
        for project in dashboard.get("projects", []):
            project_query = f'{project["name"]} {project.get("address", "")}'
            try:
                geocode = amap_geocode(project_query, city_name, key, precise=True)
                origin = geocode["location"]
                commutes = []
                for destination, destination_location in destination_cache.items():
                    destination_city, label = destination
                    if destination_city != city: continue
                    route = amap_commute(origin, destination_location, CITY_CODES[city], key)
                    commutes.append({"destination": label, "destinationAddress": COMMUTE_CENTERS[city][label], **route})
                output["projects"][project["id"]] = {"location": origin, "geocode": geocode, "collectedAt": now.isoformat(), "amenities": amap_amenities(origin, key), "commutes": commutes}
            except Exception as exc:
                output["projects"][project["id"]] = {"error": str(exc)}
    return output

def merge_amap_cache(previous: dict, fresh: dict) -> dict:
    for project_id, item in list(fresh.get("projects", {}).items()):
        old = previous.get("projects", {}).get(project_id, {})
        if item.get("error") and old.get("commutes") and old.get("geocode"):
            fresh["projects"][project_id] = {**old, "error": item["error"]}
    return fresh

def amap_refresh_due(cache: dict, now: datetime) -> bool:
    try:
        return cache.get("basisVersion") != "AMAP-WEB-V5-LOCATION-V2" or now - datetime.fromisoformat(cache["generatedAt"]) >= timedelta(days=7)
    except (KeyError, ValueError, TypeError): return True

def apply_amap_cache(dashboards: list[dict], cache: dict, now: datetime) -> tuple[int, int]:
    succeeded = failed = 0
    by_id = cache.get("projects", {})
    for dashboard in dashboards:
        dashboard_succeeded = 0
        for project in dashboard.get("projects", []):
            item = by_id.get(project["id"], {})
            if item.get("commutes") and item.get("geocode"):
                project["commutes"] = item["commutes"]
                project["amenities"] = item.get("amenities", [])
                project["amapLocation"] = item.get("location")
                if not item.get("error"): succeeded += 1; dashboard_succeeded += 1
                else: failed += 1
            else: failed += 1
            project["amapMeta"] = {"collectedAt": item.get("collectedAt"), "lastAttemptAt": cache.get("generatedAt"), "quality": "stale" if item.get("error") else "estimated" if item.get("geocode") else "pending", "error": item.get("error"), "address": (item.get("geocode") or {}).get("formattedAddress"), "level": (item.get("geocode") or {}).get("level"), "sourceUrl": AMAP_SOURCE_URL}
            if not item.get("geocode"):
                # Legacy unverified coordinates must not appear as validated commute estimates.
                project["commutes"] = [{"destination": label, "driveMinutes": None, "transitMinutes": None, "transfers": None} for label in COMMUTE_CENTERS[dashboard["city"]]]
                project["amenities"] = []
        dashboard["sources"] = [source for source in dashboard["sources"] if source["id"] != "amap"]
        dashboard["sources"].append({"id": "amap", "name": "高德地图 Web服务", "url": AMAP_SOURCE_URL, "publishedAt": cache.get("generatedAt", now.isoformat())[:10], "collectedAt": cache.get("generatedAt", now.isoformat()), "basisVersion": cache.get("basisVersion", "AMAP-WEB-V5"), "quality": "verified" if dashboard_succeeded == len(dashboard.get("projects", [])) else "stale", "note": f"每周刷新；本城 {dashboard_succeeded}/{len(dashboard.get('projects', []))} 个项目本次完成。通勤为查询时路线估计，非工作日高峰保证；失败项目保留最后有效值。"})
    return succeeded, failed

def main() -> int:
    base = os.environ.get("INGEST_URL", "").rstrip("/")
    token = os.environ.get("INGEST_TOKEN")
    if not base or not token:
        print("INGEST_URL and INGEST_TOKEN are required", file=sys.stderr); return 2
    now = datetime.now(TZ); day = now.strftime("%Y-%m-%d"); archive = Path("data/archive") / now.strftime("%Y/%m/%d"); archive.mkdir(parents=True, exist_ok=True)
    dashboards = [api_json(f"{base}/api/dashboard?city={city}&range=60")["data"] for city in ("hangzhou", "nanjing")]
    for dashboard in dashboards:
        dashboard.update(score=None, verdict="数据待补齐 · 暂不评级", rationale="成交、库存、土地等证据尚不完整，暂不计算时机指数。")
        dashboard["series"] = [p for p in dashboard.get("series", []) if p.get("quality") == "verified" and p.get("sourceUrl")]
        for part in dashboard["contributions"]: part.update(contribution=None, note="等待完整、可核验的输入数据")
    health = {}
    raw = {}
    for source_id, url in SOURCES.items():
        try:
            raw[source_id], status = fetch(url); health[source_id] = {"status": "verified", "http": status}
        except Exception as exc:
            health[source_id] = {"status": "stale", "error": str(exc)}
    if "nbs-70" in raw:
        try: apply_nbs_prices(dashboards, parse_nbs_prices(raw["nbs-70"]), now)
        except Exception as exc: health["nbs-70"] = {"status": "stale", "error": str(exc)}
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
            previous_cache = json.loads(amap_cache_path.read_text(encoding="utf-8")) if amap_cache_path.exists() else {}
            should_refresh = amap_refresh_due(previous_cache, now) or os.environ.get("FORCE_AMAP") == "1"
            if should_refresh:
                amap_cache = merge_amap_cache(previous_cache, collect_amap(dashboards, amap_key, now))
                amap_cache_path.parent.mkdir(parents=True, exist_ok=True)
                amap_cache_path.write_text(json.dumps(amap_cache, ensure_ascii=False, indent=2), encoding="utf-8")
            else:
                amap_cache = json.loads(amap_cache_path.read_text(encoding="utf-8"))
            succeeded, failed = apply_amap_cache(dashboards, amap_cache, now)
            health["amap"] = {"status": "verified" if succeeded and not failed else "stale", "projects_updated": succeeded, "projects_failed": failed, "refreshed": should_refresh}
        except Exception as exc:
            health["amap"] = {"status": "stale", "error": str(exc).replace(amap_key, '[REDACTED]')}
            for dashboard in dashboards:
                old_source = next((source for source in dashboard["sources"] if source["id"] == "amap"), {})
                dashboard["sources"] = [source for source in dashboard["sources"] if source["id"] != "amap"]
                dashboard["sources"].append({"id": "amap", "name": "高德地图 Web服务", "url": AMAP_SOURCE_URL, "publishedAt": old_source.get("publishedAt", day), "collectedAt": old_source.get("collectedAt", now.isoformat()), "basisVersion": "AMAP-WEB-V5", "quality": "stale", "note": health["amap"]["error"]})
                for project in dashboard.get("projects", []):
                    project["amapMeta"] = {**project.get("amapMeta", {}), "quality": "stale", "lastAttemptAt": now.isoformat(), "error": health["amap"]["error"], "sourceUrl": AMAP_SOURCE_URL}
    for dashboard in dashboards:
        dashboard["observedAt"] = day
        for source in dashboard["sources"]:
            if source["id"] != "amap": source["collectedAt"] = now.isoformat()
            if source["id"] in health and source["id"] != "amap": source["quality"] = health[source["id"]]["status"]
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
