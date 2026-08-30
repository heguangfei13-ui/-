import importlib.util, pathlib, unittest
from unittest.mock import patch
SPEC = importlib.util.spec_from_file_location('collect', pathlib.Path(__file__).parents[1] / 'scripts' / 'collect.py')
collect = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(collect)
class CollectorTests(unittest.TestCase):
    def test_checksum_normalizes_whole_floats(self):
        self.assertEqual(collect.canonical({'value': 2.0}), '{"value":2}')
    def test_annual_bad_page_cannot_generate_evidence(self):
        with self.assertRaises(ValueError): collect.parse_fundamentals('<html>captcha 2025</html>', 'hz-fundamentals', collect.datetime.now(collect.TZ))
    def test_hangzhou_official_annual_fixture(self):
        text = (pathlib.Path(__file__).parent / 'fixtures/hz-annual-2025.html').read_text(encoding='utf-8')
        parsed = {o['metric']: o['value'] for o in collect.parse_fundamentals(text, 'hz-fundamentals', collect.datetime.now(collect.TZ))}
        self.assertEqual(parsed['gdpGrowth'], 5.2)
        self.assertEqual(parsed['incomeGrowth'], 4.2)
        self.assertEqual(parsed['fiscalGrowth'], 2.0)
        self.assertAlmostEqual(parsed['residentGrowth'], 7.6 / 1262.4 * 100)
    def test_nanjing_annual_does_not_substitute_output_for_value_added(self):
        text = (pathlib.Path(__file__).parent / 'fixtures/nj-annual-2025.html').read_text(encoding='utf-8')
        parsed = {o['metric']: o['value'] for o in collect.parse_fundamentals(text, 'nj-fundamentals', collect.datetime.now(collect.TZ))}
        self.assertEqual(parsed['gdpGrowth'], 5.2)
        self.assertEqual(parsed['incomeGrowth'], 4.1)
        self.assertNotIn('highTechShare', parsed)
    def test_nanjing_population_same_table_yoy(self):
        text = (pathlib.Path(__file__).parent / 'fixtures/nj-population-2025.html').read_text(encoding='utf-8')
        parsed = {o['metric']: o['value'] for o in collect.parse_fundamentals(text, 'nj-population', collect.datetime.now(collect.TZ))}
        self.assertAlmostEqual(parsed['residentGrowth'], (963.85 / 957.7 - 1) * 100)
        self.assertAlmostEqual(parsed['hukouGrowth'], (747.6 / 745.45 - 1) * 100)
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
    def test_amap_transport_does_not_leak_key(self):
        key = 'test-secret-do-not-log'
        with patch.object(collect, 'api_json', side_effect=RuntimeError('https://restapi.amap.com?key=' + key)):
            with self.assertRaises(RuntimeError) as caught:
                collect.amap_json('/v3/geocode/geo', {}, key)
            self.assertNotIn(key, str(caught.exception))
            self.assertNotIn('https://', str(caught.exception))
    def test_amap_engine_error_has_one_retry(self):
        with patch.object(collect, 'api_json', side_effect=[{'status': '0', 'infocode': '30001'}, {'status': '1'}]) as api, patch.object(collect.time, 'sleep'):
            self.assertEqual(collect.amap_json('/v3/geocode/geo', {}, 'test')['status'], '1')
            self.assertEqual(api.call_count, 2)
    def test_amap_key_error_is_not_retried(self):
        with patch.object(collect, 'api_json', return_value={'status': '0', 'infocode': '10009'}) as api, patch.object(collect.time, 'sleep'):
            with self.assertRaisesRegex(ValueError, '10009'): collect.amap_json('/v3/geocode/geo', {}, 'test')
            self.assertEqual(api.call_count, 1)
    def test_amap_rejects_district_centroid(self):
        with patch.object(collect, 'amap_json', return_value={'geocodes': [{'location': '120,30', 'city': '杭州市', 'level': '区县'}]}):
            with self.assertRaisesRegex(ValueError, 'too broad'): collect.amap_geocode('test', '杭州', 'test', precise=True)
    def test_amap_refresh_failure_retains_original_timestamp(self):
        previous = {'projects': {'p': {'commutes': [1], 'geocode': {'level': '兴趣点'}, 'collectedAt': '2026-08-20'}}}
        fresh = {'generatedAt': '2026-08-30', 'projects': {'p': {'error': '30001'}}}
        merged = collect.merge_amap_cache(previous, fresh)
        self.assertEqual(merged['projects']['p']['collectedAt'], '2026-08-20')
        self.assertEqual(merged['projects']['p']['error'], '30001')
    def test_nbs_archived_release_overall_not_size_band(self):
        text = (pathlib.Path(__file__).parents[1] / 'data/archive/2026/08/30/nbs-70.html').read_text(encoding='utf-8')
        parsed = collect.parse_nbs_prices(text)
        self.assertEqual(parsed['period'], '2026-07')
        self.assertEqual(parsed['cities']['杭州']['resale'][0], 99.9)
        self.assertEqual(parsed['cities']['南京']['resale'][0], 99.7)
    def test_amap_cache_updates_project_without_changing_rank(self):
        dashboard = {'city': 'hangzhou', 'sources': [], 'projects': [{'id': 'p1', 'score': None, 'commutes': [], 'amenities': []}]}
        cache = {'generatedAt': '2026-08-30T00:00:00+08:00', 'projects': {'p1': {'location': '120,30', 'amenities': [{'category': '公园水系', 'name': '公园', 'distance': '500米'}], 'commutes': [{'destination': '滨江', 'driveMinutes': 35, 'transitMinutes': 52, 'transfers': 1}]}}}
        cache['projects']['p1']['geocode'] = {'level': '兴趣点'}
        succeeded, failed = collect.apply_amap_cache([dashboard], cache, collect.datetime.now(collect.TZ))
        self.assertEqual((succeeded, failed), (1, 0)); self.assertEqual(dashboard['projects'][0]['score'], None); self.assertEqual(dashboard['projects'][0]['commutes'][0]['driveMinutes'], 35)
if __name__ == '__main__': unittest.main()
