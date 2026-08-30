import json
import unittest
from unittest.mock import patch
from scripts import beike_probe as probe


class BeikeProbeTests(unittest.TestCase):
    def test_missing_keys_do_not_call_network(self):
        with patch.object(probe, "request_json") as call:
            self.assertFalse(probe.probe("", "")["usable"])
            call.assert_not_called()

    def test_auth_failure_does_not_call_business_api_or_log_secrets(self):
        response = {"http_status": 401, "body": {"code": 401, "msg": "invalid_client SECRET", "data": {"refresh_token": "TOKEN"}}}
        with patch.object(probe, "request_json", return_value=response) as call:
            result = probe.probe("KEY", "SECRET")
            self.assertEqual(call.call_count, 1)
        self.assertNotIn("SECRET", json.dumps(result["authentication"]))
        self.assertNotIn("TOKEN", json.dumps(result))
        self.assertFalse(result["usable"])

    def test_two_bounded_requests_without_logging_transactions(self):
        auth = {"http_status": 200, "body": {"code": 0, "data": {"access_token": "TOKEN"}}}
        case = {"http_status": 200, "body": {"code": 0, "data": {"transactionItemListOut": [{"resblockName": "PRIVATE", "transPrice": 999999}]}}}
        with patch.object(probe, "request_json", side_effect=[auth, case, case]) as call:
            result = probe.probe("KEY", "SECRET")
            self.assertEqual(call.call_count, 3)
        self.assertTrue(result["usable"])
        self.assertNotIn("PRIVATE", json.dumps(result))
        self.assertNotIn("TOKEN", json.dumps(result))
        self.assertEqual(result["transactions"][0]["sample_count"], 1)

    def test_permission_failure_stops_remaining_queries(self):
        auth = {"http_status": 200, "body": {"code": 0, "data": {"access_token": "TOKEN"}}}
        denied = {"http_status": 200, "body": {"code": 403, "msg": "没有权限"}}
        with patch.object(probe, "request_json", side_effect=[auth, denied]) as call:
            result = probe.probe("KEY", "SECRET")
            self.assertEqual(call.call_count, 2)
        self.assertEqual(result["transactions"][0]["reason"], "permission_required")

    def test_malformed_success_is_not_usable(self):
        auth = {"http_status": 200, "body": {"code": 0, "data": {"access_token": "TOKEN"}}}
        with patch.object(probe, "request_json", side_effect=[auth, {"http_status": 200, "body": {"code": 0}}]):
            self.assertFalse(probe.probe("KEY", "SECRET")["usable"])

    def test_endpoint_and_redirect_allowlist(self):
        with self.assertRaises(ValueError):
            probe.request_json("/not-authorized", {})
        self.assertIsNone(probe.NoRedirect().redirect_request(None, None, 302, "", {}, "https://other.example/"))


if __name__ == "__main__":
    unittest.main()

