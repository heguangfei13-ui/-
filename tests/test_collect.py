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
if __name__ == '__main__': unittest.main()
