import importlib.util, pathlib, unittest
SPEC = importlib.util.spec_from_file_location('collect', pathlib.Path(__file__).parents[1] / 'scripts' / 'collect.py')
collect = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(collect)
class CollectorTests(unittest.TestCase):
    def test_nanjing_fixture(self):
        text = (pathlib.Path(__file__).parent / 'fixtures' / 'nanjing-home.html').read_text(encoding='utf-8')
        result = collect.parse_nanjing(text); self.assertEqual(result['today_transactions'], 8); self.assertEqual(result['month_transaction_area'], 27.04)
    def test_lpr_fixture(self):
        text = (pathlib.Path(__file__).parent / 'fixtures' / 'lpr.html').read_text(encoding='utf-8'); self.assertEqual(collect.parse_lpr(text), 3.5)
    def test_abnormal_page_fails_closed(self):
        with self.assertRaises(ValueError): collect.parse_nanjing('<html>captcha</html>')
    def test_amap_duration_uses_cost_seconds(self):
        self.assertEqual(collect.amap_duration_minutes({'cost': {'duration': '3720'}}), 62)
        self.assertIsNone(collect.amap_duration_minutes({}))
    def test_amap_cache_updates_project_without_changing_rank(self):
        dashboard = {'city': 'hangzhou', 'sources': [], 'projects': [{'id': 'p1', 'score': None, 'commutes': [], 'amenities': []}]}
        cache = {'generatedAt': '2026-08-30T00:00:00+08:00', 'projects': {'p1': {'location': '120,30', 'amenities': [{'category': '公园水系', 'name': '公园', 'distance': '500米'}], 'commutes': [{'destination': '滨江', 'driveMinutes': 35, 'transitMinutes': 52, 'transfers': 1}]}}}
        succeeded, failed = collect.apply_amap_cache([dashboard], cache, collect.datetime.now(collect.TZ))
        self.assertEqual((succeeded, failed), (1, 0)); self.assertEqual(dashboard['projects'][0]['score'], None); self.assertEqual(dashboard['projects'][0]['commutes'][0]['driveMinutes'], 35)
if __name__ == '__main__': unittest.main()
