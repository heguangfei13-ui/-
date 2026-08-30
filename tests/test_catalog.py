import unittest
from scripts.catalog import parse_nj,discover_nj,append_history,apply_catalog
from pathlib import Path
from datetime import datetime, timedelta
from tempfile import TemporaryDirectory
from unittest.mock import patch
from scripts import catalog as module


class CatalogTests(unittest.TestCase):
    def test_association_residential_identity_does_not_import_manager_as_developer(self):
        html=Path('tests/fixtures/catalog-association.html').read_text(encoding='utf8')
        rows=module.parse_hz_association(html)
        self.assertEqual(rows,[{'name':'保利中盛府','district':'上城区','year':'2024'}])
        with self.assertRaises(ValueError):module.parse_hz_association('<html>访问受限</html>')

    def test_search_validates_page_and_drops_contact_price_fields(self):
        payload={'page':{'pageNumber':2,'pageSize':20,'totalPageCount':3},'data':[
            {'prjId':'123','projectName':'测试花园','dist':'江宁区','usage':'一般住宅','location':'测试路','salesTel':'13800000000','avp1':'50000'},
            {'prjId':'456','projectName':'办公楼','dist':'江宁区','usage':'非住宅'}]}
        rows,count=module.parse_nj_search(payload,2)
        self.assertEqual(count,3)
        self.assertEqual(rows,[{'number':'123','name':'测试花园','district':'江宁区','address':'测试路','usage':'一般住宅'}])
        with self.assertRaises(ValueError):module.parse_nj_search(payload,1)

    def test_compound_district_keeps_original_and_bad_names_are_quarantined(self):
        payload={'page':{'pageNumber':1,'pageSize':20,'totalPageCount':1},'data':[
            {'prjId':'123','projectName':'测试花园','dist':'江北新区(浦口区)','usage':'住宅'}]}
        rows,_=module.parse_nj_search(payload,1)
        self.assertEqual(rows[0]['district'],'江北新区')
        self.assertEqual(rows[0]['sourceDistrict'],'江北新区(浦口区)')
        html=Path('tests/fixtures/catalog-association.html').read_text(encoding='utf8')
        rejected=[]
        rows=module.parse_hz_association(html+html.replace('保利中盛府','异常?混合名称'),rejected)
        self.assertEqual(len(rows),1); self.assertEqual(len(rejected),1)

    def test_source_allowlist_and_http_rejections_cannot_be_overridden(self):
        with self.assertRaises(ValueError):module.fetch_public('https://other.test/catalog')
        with self.assertRaises(ValueError):module.fetch_public('http://www.njhouse.com.cn/projectindex.html')
        with self.assertRaises(ValueError):module.fetch_public(module.NJ_INDEX,{'write':'no'})
        result=type('Result',(),{'returncode':1,'stdout':b'','stderr':b'HTTP_STATUS:403'})()
        with patch.object(module.sys,'platform','win32'),patch.object(module.subprocess,'run',return_value=result):
            with self.assertRaises(module.HTTPError):module.fetch_public(module.NJ_INDEX)
        cfg={'discovery':{'hz-property-association':{'refreshDays':30}}}
        health={'hz-property-association':{'status':'stale','error':'HTTPError','lastAttemptAt':'2026-08-30T10:00:00+08:00'}}
        with patch.object(module,'fetch_public') as fetch:
            module.collect_discovery(cfg,{},health,Path('.'),datetime.fromisoformat('2026-08-30T12:00:00+08:00'),retry=True)
            fetch.assert_not_called()

    def test_stock_needs_active_residential_filter_and_never_maps_listing_price(self):
        html=Path('tests/fixtures/catalog-stock.html').read_text(encoding='utf8')
        self.assertEqual(module.parse_nj_stock(html,1),[{'name':'测试花园','district':'江宁区'}])
        with self.assertRaises(ValueError):module.parse_nj_stock(html,2)
        with self.assertRaises(ValueError):module.parse_nj_stock(html.replace('active" data-index="1"><span>住宅','" data-index="1"><span>住宅'),1)

    def test_identity_merge_preserves_richer_evidence_and_district_and_phase(self):
        meta={'id':'test','quality':'verified','collectedAt':'2026-08-30T10:00:00+08:00'}
        records={}
        row={'name':'测试花园一期','district':'上城区'}
        first=module.merge_discovered_identity(records,row,'hangzhou',meta)
        self.assertIsNone(first['averagePrice']); self.assertIsNone(first['score'])
        self.assertEqual(first['housingType'],'unknown'); self.assertEqual(first['developer'],'待核验')
        first.update(averagePrice=50000,assetEvidence=[{'metric':'verified-example'}],source={**meta,'id':'richer'})
        module.merge_discovered_identity(records,row,'hangzhou',meta)
        self.assertEqual(len(records),1); self.assertEqual(first['averagePrice'],50000)
        self.assertEqual(first['source']['id'],'richer')
        module.merge_discovered_identity(records,{**row,'district':'西湖区'},'hangzhou',meta)
        module.merge_discovered_identity(records,{**row,'name':'测试花园二期'},'hangzhou',meta)
        self.assertEqual(len(records),3)

    def test_discovery_failure_preserves_evidence_time_and_cache_does_not_fake_refresh(self):
        now=datetime.fromisoformat('2026-08-30T12:00:00+08:00')
        cfg={'discovery':{'hz-property-association':{'url':'https://hzswyglxh.com/SearchCityAuditList.aspx','name':'协会','refreshDays':30,'basisVersion':'identity'}}}
        html=Path('tests/fixtures/catalog-association.html').read_bytes()
        records,health={},{}
        with TemporaryDirectory() as folder:
            with patch.object(module,'fetch_public',return_value=html),patch.object(module.time,'sleep'):
                module.collect_discovery(cfg,records,health,Path(folder),now)
            stamp=next(iter(records.values()))['source']['collectedAt']
            with patch.object(module,'fetch_public',side_effect=RuntimeError('unavailable')) as fetch:
                module.collect_discovery(cfg,records,health,Path(folder),now+timedelta(days=1))
                fetch.assert_not_called()
                module.collect_discovery(cfg,records,health,Path(folder),now+timedelta(days=31))
            self.assertEqual(next(iter(records.values()))['source']['collectedAt'],stamp)
            self.assertEqual(next(iter(records.values()))['source']['quality'],'stale')
            self.assertEqual(health['hz-property-association']['lastSuccessAt'],stamp)

    def test_search_partial_run_resumes_after_archived_page(self):
        cfg={'discovery':{'nj-project-search':{'url':module.NJ_SEARCH,'name':'目录','refreshDays':1,'pagesPerRun':3,'basisVersion':'identity'}}}
        payload={'page':{'pageNumber':1,'pageSize':20,'totalPageCount':10},'data':[
            {'prjId':'123','projectName':'测试花园','dist':'江宁区','usage':'住宅'}]}
        records,health={},{}
        with TemporaryDirectory() as folder,patch.object(module,'fetch_public',side_effect=[module.json.dumps(payload).encode(),TimeoutError()]),patch.object(module.time,'sleep'):
            module.collect_discovery(cfg,records,health,Path(folder),datetime.fromisoformat('2026-08-30T12:00:00+08:00'))
            self.assertEqual(health['nj-project-search']['nextPage'],2)
            self.assertEqual(len(records),1)
            self.assertEqual(len(list(Path(folder).glob('*.json'))),1)

    def test_real_archived_project_and_non_residential_rejection(self):
        html=Path('data/archive/2026/08/30/evidence/nj-yuemanyunchuanfu.html').read_text(encoding='utf8')
        p=parse_nj(html,'樾满云川府')
        self.assertEqual(p['counts']['total'],p['counts']['sold']+p['counts']['available']+p['counts']['subscribed'])
        self.assertIn('住宅',p['usage'])
        with self.assertRaises(ValueError):parse_nj(html,'西溪蝶园')
        with self.assertRaises(ValueError):parse_nj(html.replace('一般住宅','办公'),'樾满云川府')

    def test_search_page_is_not_a_detail(self):
        with self.assertRaises(ValueError):parse_nj('<h2>目录</h2>樾满云川府 项目整体销售情况','樾满云川府')

    def test_discover_uses_links_not_guessed_ids(self):
        page='<a href="/project/info/123/homePage.html"><div class="fw-bold">真实花园</div>住宅</a><a href="https://evil.test/project/info/456/homePage.html"><div class="fw-bold">伪造</div>住宅</a>'
        self.assertEqual([p['number'] for p in discover_nj(page)],['123'])

    def test_revision_and_distinct_basis(self):
        p={'sourceUrl':'https://www.njhouse.com.cn/','observedAt':'2026-08-30T09:00:00+08:00','basisVersion':'all','sold':10}
        newer={**p,'observedAt':'2026-08-30T18:00:00+08:00','sold':9}
        self.assertEqual(append_history([p],newer),[newer])
        self.assertEqual(append_history([newer],p),[newer])
        self.assertEqual(len(append_history([p],{**newer,'basisVersion':'residential'})),2)

    def test_merge_preserves_scores_prices_and_is_idempotent(self):
        data=[{'city':'hangzhou','projects':[{'id':'a','city':'hangzhou','averagePrice':50000,'assetEvidence':[1]}]}]
        catalog={'projects':[{'id':'a','city':'hangzhou','averagePrice':None,'housingType':'resale'},{'id':'b','city':'hangzhou'}]}
        apply_catalog(data,catalog); apply_catalog(data,catalog)
        self.assertEqual(len(data[0]['projects']),2)
        self.assertEqual(data[0]['projects'][0]['averagePrice'],50000)
        self.assertEqual(data[0]['projects'][0]['assetEvidence'],[1])

    def test_old_catalog_cannot_replace_newer_persisted_sales(self):
        point={'sourceUrl':'https://www.njhouse.com.cn/','observedAt':'2026-08-30T09:00:00+08:00','basisVersion':'all','sold':10}
        newer={**point,'observedAt':'2026-08-30T18:00:00+08:00','sold':12}
        data=[{'city':'nanjing','projects':[{'id':'a','city':'nanjing','salesHistory':[newer]}]}]
        apply_catalog(data,{'projects':[{'id':'a','city':'nanjing','salesHistory':[point]}]})
        self.assertEqual(data[0]['projects'][0]['salesHistory'],[newer])


if __name__=='__main__':unittest.main()
