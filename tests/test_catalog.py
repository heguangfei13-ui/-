import unittest
from scripts.catalog import parse_nj,discover_nj,append_history,apply_catalog
from pathlib import Path


class CatalogTests(unittest.TestCase):
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


if __name__=='__main__':unittest.main()

