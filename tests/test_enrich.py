import unittest,json
from pathlib import Path
from scripts.enrich import parse_project,parse_permit
from scripts.collect import parse_nbs_prices
ROOT=Path(__file__).parents[1]
class EnrichmentTests(unittest.TestCase):
    def test_actual_project_fixtures(self):
        text=(ROOT/'data/archive/2026/08/30/evidence/nj-yuemanyunchuanfu.html').read_text(encoding='utf8')
        result=parse_project(text,'樾满云川府')
        self.assertIn('竹山路',result['address']);self.assertGreater(result['inventory']['total'],0)
        with self.assertRaises(ValueError):parse_project(text,'非本项目')
    def test_permit_indicators_are_not_total_floor_area_ratios(self):
        self.assertEqual(parse_permit('樾满云川府 总建筑面积178903.24 用地66912.07','樾满云川府'),{})
        self.assertEqual(parse_permit('樾满云川府 容积率1.8 绿地率20%','樾满云川府'),{'floorAreaRatio':1.8,'greenRatio':20})
        with self.assertRaises(ValueError):parse_permit('樾满云川府 容积率100','樾满云川府')
    def test_all_archived_price_tables_match_periods(self):
        files=list((ROOT/'data/archive/2026/08/30/evidence').glob('nbs-*.html'))
        self.assertGreaterEqual(len(files),6)
        for file in files:self.assertEqual(parse_nbs_prices(file.read_text(encoding='utf8'))['period'],file.stem[4:])
    def test_actual_product_inputs_have_traceable_sources(self):
        data=json.loads((ROOT/'data/verified-enrichment.json').read_text(encoding='utf8'))
        for project in data['projects'].values():
            for obs in project['assetEvidence']:
                self.assertIn(obs['metric'],['floorAreaRatio','greenRatio']);self.assertTrue(obs['sources'][0]['url'].startswith('https://www.njhouse.com.cn/'))
if __name__=='__main__':unittest.main()
