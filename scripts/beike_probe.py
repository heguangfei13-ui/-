"""Bounded official Beike API verification; never logs credentials or property data.

Protocol: https://open.ke.com/serviceSupport/getToken/
Cases: https://open.ke.com/serviceSupport/successCase/
Only the OAuth endpoint receives AK/SK. Redirects are deliberately forbidden.
"""
import json
import os
import re
import sys
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import HTTPRedirectHandler, Request, build_opener

ORIGIN = "https://gw-open.ke.com"
PATHS = {"/oauth/token", "/api/assessTransactionCase"}
TARGETS = (("杭州市", "西溪蝶园一期"), ("南京市", "万科金域缇香"))


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def request_json(path, params, token=None):
    if path not in PATHS:
        raise ValueError("endpoint_not_allowed")
    headers = {"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json",
               "User-Agent": "HomeCompass/1.0 (authorized API verification)"}
    if token:
        headers["access_token"] = token
    request = Request(ORIGIN + path, data=urlencode(params).encode(), headers=headers, method="POST")
    try:
        response = build_opener(NoRedirect()).open(request, timeout=25)
    except HTTPError as exc:
        if 300 <= exc.code < 400:
            return {"http_status": exc.code, "transport": "redirect_rejected"}
        response = exc
    except (URLError, TimeoutError, OSError):
        return {"transport": "connection_failed"}
    with response:
        raw = response.read(2_000_001)
        if len(raw) > 2_000_000:
            return {"http_status": response.code, "transport": "response_too_large"}
        try:
            value = json.loads(raw)
        except (ValueError, UnicodeError):
            return {"http_status": response.code, "transport": "non_json_response"}
        if not isinstance(value, dict):
            return {"http_status": response.code, "transport": "invalid_response"}
        return {"http_status": response.code, "body": value}


def safe_status(response):
    """Allowlist status fields: provider messages may echo request secrets."""
    result = {k: response[k] for k in ("http_status", "transport") if k in response}
    body = response.get("body", {})
    code = body.get("code")
    if type(code) is int and abs(code) < 10**12:
        result["provider_code"] = code
    elif isinstance(code, str) and re.fullmatch(r"-?\d{1,10}", code):
        result["provider_code"] = int(code)
    message = str(body.get("msg", body.get("error_description", "")))
    if any(word in message for word in ("权限", "授权", "permission", "privilege", "开通")):
        result["reason"] = "permission_required"
    elif any(word in message for word in ("余额", "额度", "quota", "balance")):
        result["reason"] = "quota_or_balance_required"
    elif any(word in message for word in ("密钥", "invalid_client", "client_secret", "认证", "AppKey", "appkey")):
        result["reason"] = "credential_or_application_rejected"
    return result


def probe(key, secret):
    report = {"checked_at": datetime.now(timezone.utc).isoformat(),
              "secrets_present": {"BEIKE_APP_KEY": bool(key), "BEIKE_APP_SECRET": bool(secret)},
              "authentication": {"ok": False}, "transactions": [], "usable": False,
              "scope": "verification_only_no_property_data_persisted"}
    if not key or not secret:
        report["authentication"]["reason"] = "missing_github_secrets"
        return report
    response = request_json("/oauth/token", {"grant_type": "client_credentials", "client_id": key, "client_secret": secret})
    body = response.get("body", {})
    data = body.get("data") if isinstance(body.get("data"), dict) else {}
    token = data.get("access_token")
    ok = response.get("http_status") == 200 and body.get("code") in (0, "0") and isinstance(token, str) and bool(token)
    report["authentication"] = {**safe_status(response), "ok": ok}
    if not ok:
        return report
    for city, community in TARGETS:
        response = request_json("/api/assessTransactionCase", {
            "standCity": city, "standDetailedAddress": community, "standResblock": community,
            "standPriceAssessBuildArea": "120", "timePeriod": "LAST_SIX_MONTH",
        }, token)
        body = response.get("body", {})
        data = body.get("data") if isinstance(body.get("data"), dict) else {}
        samples = data.get("transactionItemListOut")
        ok = response.get("http_status") == 200 and body.get("code") in (0, "0") and isinstance(samples, list)
        # No addresses, names, prices, arbitrary payload keys, or provider tokens in logs.
        report["transactions"].append({"city": city, **safe_status(response), "ok": ok,
            "sample_count": len(samples) if ok else None,
            "sample_not_full_market": True})
        if not ok:
            break  # Stop on denied service, quota, or shape failure; no retry storm.
    report["usable"] = len(report["transactions"]) == len(TARGETS) and all(r["ok"] for r in report["transactions"])
    return report


def main():
    try:
        report = probe(os.environ.get("BEIKE_APP_KEY", ""), os.environ.get("BEIKE_APP_SECRET", ""))
    except Exception:
        # Never expose traceback locals, exception messages or request data.
        report = {"usable": False, "error": "unexpected_probe_error"}
    print(json.dumps(report, ensure_ascii=False))
    return 0 if report.get("usable") else 1


if __name__ == "__main__":
    sys.exit(main())

