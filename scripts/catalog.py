"""Public-source residential directory. Identity != sale offer != transaction.

No credentials, gated endpoints, contact details or fabricated prices. Fetches
only registered public sources and bounded same-site NJ project links. Each
successful observation is archived before publishing a merged snapshot.
"""
from __future__ import annotations
import hashlib
import io
import json
import re
import subprocess
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import urlparse, urlencode
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError
from html import unescape

ROOT = Path(__file__).resolve().parents[1]
TZ = timezone(timedelta(hours=8))
CONFIG = ROOT / 'data/catalog-sources.json'
DEST = ROOT / 'data/community-catalog.json'
NJ_INDEX = 'https://www.njhouse.com.cn/projectindex.html'
MAX_NEW = 16
NJ_SEARCH = 'https://www.njhouse.com.cn/jsmart/nj/web/webProjectSearch'
NJ_STOCK = 'https://njzl.njhouse.com.cn/stock/houselist/'
NJ_DISTRICTS = {'江北新区','玄武区','秦淮区','建邺区','鼓楼区','浦口区','栖霞区','雨花台区','江宁区','六合区','溧水区','高淳区'}
HZ_DISTRICTS = {'上城区','拱墅区','西湖区','滨江区','萧山区','余杭区','临平区','钱塘区','富阳区','临安区','桐庐县','淳安县','建德市'}


def plain(html):
    html = re.sub(r'<(script|style)\b[^>]*>.*?</\1>', '', html, flags=re.S|re.I)
    return unescape(re.sub(r'<[^>]+>', ' ', html))


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def fetch_public(url, form=None):
    host = urlparse(url).hostname
    if urlparse(url).scheme != 'https' or host not in {
        'www.njhouse.com.cn', 'www.hz-notary.com', 'njzl.njhouse.com.cn', 'hzswyglxh.com',
        'zjjcmspublic.oss-cn-hangzhou-zwynet-d01-a.internet.cloud.zj.gov.cn',
    }:
        raise ValueError('source outside allowlist')
    if form is not None and url != NJ_SEARCH:
        raise ValueError('POST is only allowed for the public read-only project search')
    data = urlencode(form).encode('utf8') if form is not None else None
    agent = 'HomeCompass/1.0 public-source daily research'
    if sys.platform=='win32':
        # .NET uses the host's normal TLS configuration; never weaken verification or follow redirects.
        args = ['pwsh','-NoProfile','-File',str(ROOT/'scripts/fetch-public.ps1'),'-Url',url]
        if data is not None: args += ['-FormBody',data.decode('utf8')]
        result = subprocess.run(args,capture_output=True,timeout=35)
        status = re.search(rb'HTTP_STATUS:(\d+)',result.stderr)
        if status: raise HTTPError(url,int(status[1]),'public source request rejected',None,None)
        if result.returncode: raise TimeoutError('native HTTPS transport incomplete')
        raw = result.stdout
    else:
        with build_opener(NoRedirect()).open(Request(url, data=data, headers={'User-Agent':agent}), timeout=25) as response:
            raw = response.read(24_000_001)
    if len(raw) > 24_000_000:
        raise ValueError('source too large')
    return raw


def identity_name(value):
    name = re.sub(r'\s+', '', plain(str(value)))
    if not 2 <= len(name) <= 80 or any(c in name for c in '\ufffd?<>'):
        raise ValueError('invalid community identity')
    return name


def nj_district(value):
    value = str(value).strip()
    if re.fullmatch(r'江北新区[（(](?:浦口区|六合区)[）)]',value): return '江北新区'
    return value


def parse_hz_association(html, rejected=None):
    """Only residential identity rows; never turn the participating manager into a developer."""
    rows = {}
    for block in re.findall(r'<ul\b[^>]*>(.*?)</ul>', html, re.S|re.I):
        cells = {key: plain(value).strip() for key,value in re.findall(r'<li\s+class=["\']L([1-6])["\'][^>]*>(.*?)</li>', block, re.S|re.I)}
        if cells.get('5') != '住宅': continue
        if not re.fullmatch(r'20\d{2}', cells.get('2','')) or cells.get('3') not in HZ_DISTRICTS:
            raise ValueError('association residential row shape changed')
        try: name = identity_name(cells.get('4',''))
        except ValueError:
            if rejected is None: raise
            rejected.append({'row':cells.get('1',''),'reason':'invalid community name'})
            continue
        row = {'name':name, 'district':cells['3'], 'year':cells['2']}
        key = (row['district'],row['name'])
        if key not in rows or row['year'] > rows[key]['year']: rows[key] = row
    if not rows: raise ValueError('no residential association rows')
    return list(rows.values())


def parse_nj_search(payload, page_number, rejected=None):
    page = payload.get('page', {})
    if not isinstance(payload.get('data'),list) or page.get('pageNumber') != page_number or not isinstance(page.get('totalPageCount'),int):
        raise ValueError('project search pagination changed')
    if page.get('pageSize') != 20 or not 0 <= page['totalPageCount'] <= 1000 or len(payload['data']) > 20:
        raise ValueError('project search size outside bounds')
    rows = []
    for index,item in enumerate(payload['data']):
        usage = item.get('usage','')
        if '住宅' not in usage or '非住宅' in usage or '经济适用' in usage: continue
        number = str(item.get('prjId',''))
        district = nj_district(item.get('dist',''))
        if not re.fullmatch(r'\d{1,12}',number) or district not in NJ_DISTRICTS:
            if rejected is not None:
                rejected.append({'row':index+1,'reason':'project number or district incomplete'})
                continue
            raise ValueError('project search identity incomplete')
        row = {'number':number,'name':identity_name(item.get('projectName','')),
               'district':district,'address':plain(item.get('location','')).strip(),'usage':usage}
        if district!=item['dist']: row['sourceDistrict']=item['dist']
        rows.append(row)
    return rows, page['totalPageCount']


def parse_nj_stock(html, page_number):
    # A residential filter must actually be selected, not merely requested in the URL.
    filters = re.search(r'<div\s+data-fname=["\']t["\'][^>]*>(.*?)</div>',html,re.S)
    pagination = re.search(r'<div[^>]*data-fname=["\']p["\'][^>]*>(.*?)</div>',html,re.S)
    def selected(block, number):
        for attrs,body in re.findall(r'<a\b([^>]*)>(.*?)</a>',block or '',re.S):
            cls = re.search(r'class=["\']([^"\']*)',attrs)
            index = re.search(r'data-index=["\'](\d+)',attrs)
            if cls and 'active' in cls[1].split() and index and int(index[1]) == number:
                return plain(body).strip()
        return None
    if not filters or selected(filters[1],1) != '住宅' or not pagination or selected(pagination[1],page_number) is None:
        raise ValueError('stock residential filter or pagination not confirmed')
    rows = {}
    for body in re.findall(r'<a\b[^>]*href=["\']stock/show/\d+["\'][^>]*>(.*?)</a>',html,re.S):
        name = re.search(r'<div[^>]*class=["\'][^"\']*\bfs22\b[^"\']*["\'][^>]*>(.*?)</div>',body,re.S)
        location = re.search(r'<div[^>]*class=["\'][^"\']*\blocation\b[^"\']*["\'][^>]*>(.*?)</div>',body,re.S)
        if not name or not location: raise ValueError('stock identity row changed')
        district = nj_district(plain(location[1]).strip().split('-')[0])
        if district not in NJ_DISTRICTS: raise ValueError('stock district unknown')
        row = {'name':identity_name(name[1]),'district':district}
        rows[(district,row['name'])] = row
    if not rows: raise ValueError('no stock residential identities')
    return list(rows.values())


def identity_id(city, district, name):
    # Keep districts and phases in the identity. No fuzzy alias or cross-district merge.
    prefix = 'hz' if city=='hangzhou' else 'nj'
    return f'{prefix}-community-' + hashlib.sha256(f'{city}:{district}:{name}'.encode()).hexdigest()[:16]


def merge_discovered_identity(previous, row, city, meta, housing_type='unknown'):
    if row.get('number'):
        known = [p for p in previous.values() if p.get('officialProjectNumber') == row['number']]
        project_id = known[0]['id'] if len(known)==1 else f"nj-official-{row['number']}"
    else:
        known = [p for p in previous.values() if p['city']==city and identity_name(p['name'])==row['name'] and p['district']==row['district']]
        project_id = known[0]['id'] if len(known)==1 else identity_id(city,row['district'],row['name'])
    target = {**row,'id':project_id,'housingType':housing_type,
              'address':row.get('address') or f"{row['district']}·详细地址待核验",
              'scope':'仅核验目录名称与区属；不证明产权可交易、当前供应、价格、学区或资产质量'}
    old = previous.get(project_id)
    if old:
        # A directory recheck must not overwrite project-detail, price, sales or scoring provenance.
        if old['source']['id'] == meta['id']: old['source'] = meta
        return old
    project = base_project(target,city,meta)
    if row.get('number'): project['officialProjectNumber'] = row['number']
    previous[project_id] = project
    return project


def collect_discovery(cfg, previous, health, archive, now, retry=False):
    stamp = now.isoformat()
    for sid,source in cfg.get('discovery',{}).items():
        old_health = health.get(sid,{})
        last = old_health.get('lastSuccessAt')
        if last and old_health.get('status') in ('verified','partial') and now-datetime.fromisoformat(last)<timedelta(days=source['refreshDays']): continue
        # Manual parser/transport retry never overrides an HTTP access-control rejection.
        retryable = retry and old_health.get('error') in ('ValueError','TimeoutError','TimeoutExpired','URLError')
        if old_health.get('status')=='stale' and old_health.get('lastAttemptAt','')[:10]==stamp[:10] and not retryable: continue
        matched = 0
        rejected_count = 0
        next_page = old_health.get('nextPage',1)
        try:
            if sid=='hz-property-association': pages = [1]
            elif sid=='nj-project-search': pages = range(next_page,next_page+min(source['pagesPerRun'],3))
            elif sid=='nj-stock-directory': pages = range(1,min(source['pagesPerRun'],2)+1)
            else: raise ValueError('unknown discovery source')
            for page in pages:
                url = source['url']
                rejected = []
                if sid=='hz-property-association':
                    raw = fetch_public(url)
                    rows = parse_hz_association(raw.decode('utf8'),rejected)
                    city,kind = 'hangzhou','unknown'
                    note = '行业协会公开历史住宅名录，仅核实身份；不是政府房源或当前物业质量结论。'
                elif sid=='nj-project-search':
                    raw = fetch_public(url,{'searchable.usage':'住宅','page.pageNumber':page,'page.pageSize':20})
                    rows,total_pages = parse_nj_search(json.loads(raw),page,rejected)
                    city,kind = 'nanjing','unknown'
                    note = '官方住宅项目目录；历史开盘记录不推断当前新房/二手房供应，价格和成交待另核验。'
                    next_page = page+1 if page<total_pages else 1
                else:
                    url = f'{NJ_STOCK}t-1_p-{page}'
                    raw = fetch_public(url)
                    rows = parse_nj_stock(raw.decode('utf8'),page)
                    city,kind = 'nanjing','resale'
                    note = '官方平台公开的经纪机构住宅挂牌列表，仅提取小区名称和区属；不保存挂牌价格、个人资料，不等于二手成交。'
                # Selected raw facts plus checksum: no brokers, phones, unit identifiers or prices.
                record = {'sourceId':sid,'url':url,'collectedAt':stamp,'sourceSha256':hashlib.sha256(raw).hexdigest(),'rows':rows,'rejected':rejected}
                (archive/f'{sid}-{now.strftime("%H%M%S%f")}-p{page}.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
                for row in rows:
                    meta = {'id':sid,'name':source['name'],'url':url,'publishedAt':'','collectedAt':stamp,
                            'basisVersion':source['basisVersion'],'quality':'verified',
                            'note':note+(f" 名录年度：{row['year']}；具体发布日期未提供。" if row.get('year') else ' 发布时间未提供，采集时间为观察时间。')+(f" 源区属：{row['sourceDistrict']}。" if row.get('sourceDistrict') else '')}
                    merge_discovered_identity(previous,row,city,meta,kind)
                matched += len(rows)
                rejected_count += len(rejected)
                time.sleep(.5)
                if sid=='nj-project-search' and next_page==1: break
            health[sid] = {'status':'partial' if rejected_count else 'verified','lastSuccessAt':stamp,'lastAttemptAt':stamp,'matched':matched,'rejected':rejected_count,'nextPage':next_page}
        except Exception as exc:
            health[sid] = {**old_health,'status':'stale','lastAttemptAt':stamp,'error':type(exc).__name__,'matchedThisAttempt':matched,'nextPage':next_page}
            for p in previous.values():
                if p['source']['id']==sid: p['source']['quality']='stale'
        print(f"{sid}: {health[sid]['status']}, identities={matched}, rejected={rejected_count}, error={health[sid].get('error','')}",file=sys.stderr,flush=True)


def parse_nj(html, name):
    text = re.sub(r'\s+', '', plain(html))
    titles = [re.sub(r'\s+', '', plain(x)) for x in re.findall(r'<h[1-3][^>]*>(.*?)</h[1-3]>', html, re.S|re.I)]
    titles += [re.sub(r'\s+', '', plain(x)) for x in re.findall(r'<div[^>]*class=["\'][^"\']*fw-bold fs-4[^"\']*["\'][^>]*>(.*?)</div>',html,re.S)]
    # Do not accept a list/search page containing the requested name incidentally.
    if name not in titles or '项目整体销售情况' not in text:
        raise ValueError('not the requested project detail')
    def cell(label):
        found = re.search(r'<t[dh][^>]*>\s*'+label+r'\s*</t[dh]>\s*<td[^>]*>(.*?)</td>', html, re.S)
        return re.sub(r'\s+', ' ', plain(found[1])).strip() if found else ''
    usage = cell('用途')
    if '住宅' not in usage:
        raise ValueError('not a residential project')
    address, developer = cell('项目地址'), cell('开发企业')
    if not address or not developer:
        raise ValueError('project identity incomplete')
    district = next((d for d in ['江北新区','玄武区','秦淮区','建邺区','鼓楼区','浦口区','栖霞区','雨花台区','江宁区','六合区','溧水区','高淳区'] if d in address), '南京市·区属待核验')
    counts = {}
    for key,label in [('total','入网总套数'),('sold','总成交套数'),('available','未售总套数'),('subscribed','总认购套数'),('todaySold','今日成交')]:
        found = re.search(label+r'([\d,]+)套',text)
        if not found:
            raise ValueError('sales table incomplete')
        counts[key] = int(found[1].replace(',',''))
    if counts['sold']+counts['available']+counts['subscribed'] != counts['total'] or counts['todaySold'] > counts['sold']:
        raise ValueError('sales table does not reconcile')
    return {'address':address,'developer':developer,'district':district,'usage':usage,'counts':counts}


def discover_nj(html):
    found = {}
    for number,body in re.findall(r'<a[^>]+href=["\']/project/info/(\d+)/homePage.html["\'][^>]*>(.*?)</a>',html,re.S):
        match=re.search(r'<div[^>]*class=["\'][^"\']*fw-bold[^"\']*["\'][^>]*>(.*?)</div>',body,re.S)
        text=plain(body)
        if not match or '住宅' not in text or '经济适用' in text:
            continue
        name=plain(match[1]).strip()
        if not 2<=len(name)<=40: continue
        found[number]={'id':f'nj-official-{number}','number':number,'name':name,'housingType':'new'}
    return list(found.values())[:MAX_NEW]


def base_project(target, city, source):
    return {
        'id':target['id'],'name':target['name'],'city':city,
        'district':target.get('district','杭州市·区属待核验' if city=='hangzhou' else '南京市·区属待核验'),
        'address':target.get('address',('杭州市' if city=='hangzhou' else '南京市')+target['name']),
        'developer':'待核验','housingType':target.get('housingType','resale'),
        'areaRange':[None,None],'averagePrice':None,'totalCostRange':[None,None],
        'status':'watchlist','evidenceStatus':'pending','score':None,
        'tags':['已核实目录身份','非购买推荐'],
        'risks':['当前可售房源、价格和二手成交尚未核验'],
        'permits':[],'amenities':[],'commutes':[],
        'catalogIdentity':{'verified':True,'scope':target.get('scope','只核实小区/项目身份，不证明当前有符合预算的在售房源')},
        'source':source,
    }


def append_history(old, point):
    key = (point['sourceUrl'],point['observedAt'][:10],point['basisVersion'])
    if any((p['sourceUrl'],p['observedAt'][:10],p['basisVersion'])==key and p['observedAt']>point['observedAt'] for p in old): return old
    return sorted([p for p in old if (p['sourceUrl'],p['observedAt'][:10],p['basisVersion'])!=key]+[point],key=lambda p:p['observedAt'])[-400:]


def apply_catalog(dashboards, catalog):
    for dashboard in dashboards:
        by_id={p['id']:p for p in dashboard.get('projects',[])}
        for p in catalog.get('projects',[]):
            if p['city'] != dashboard['city']: continue
            old=by_id.get(p['id'])
            if old:
                # Keep scoring/AMap evidence and priced releases; catalog owns identity and its own sales history only.
                old.update({k:p[k] for k in ['housingType','catalogIdentity'] if k in p})
                for point in p.get('salesHistory',[]):
                    old['salesHistory']=append_history(old.get('salesHistory',[]),point)
            else: by_id[p['id']]=json.loads(json.dumps(p))
        dashboard['projects']=list(by_id.values())
        sources={s['id']:s for s in dashboard.get('sources',[])}
        for p in by_id.values():
            if p.get('catalogIdentity') and p.get('source'): sources.setdefault(p['source']['id'],p['source'])
        dashboard['sources']=list(sources.values())
        dashboard['catalogCoverage']={'complete':False,'projects':len(by_id),'resaleTransactions':0,'note':'目录持续扩充；官方项目累计成交可能含车位，不是二手住宅成交。'}


def collect_catalog(discovery_only=False, retry_discovery=False):
    cfg=json.loads(CONFIG.read_text(encoding='utf8'))
    now=datetime.now(TZ); stamp=now.isoformat()
    out=json.loads(DEST.read_text(encoding='utf8')) if DEST.exists() else {'schemaVersion':1,'projects':[],'health':{}}
    previous={p['id']:p for p in out['projects']}
    reviewed_path=ROOT/'data/reviewed-community-identities.json'
    if reviewed_path.exists():
        for p in json.loads(reviewed_path.read_text(encoding='utf8')):
            previous.setdefault(p['id'],p)
    archive=ROOT/'data/archive'/now.strftime('%Y/%m/%d')/'catalog'
    archive.mkdir(parents=True,exist_ok=True)
    if discovery_only:
        collect_discovery(cfg,previous,out['health'],archive,now,retry_discovery)
        out.update(projects=list(previous.values()),generatedAt=stamp,complete=False)
        DEST.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
        return out
    # Document identity is stable: recheck monthly. Never refresh its original evidence timestamp on a cache hit.
    for sid,source in cfg['sources'].items():
        targets=[t for t in cfg['hangzhou'] if t['sourceId']==sid]
        last=out['health'].get(sid,{}).get('lastSuccessAt')
        failed=out['health'].get(sid,{}).get('lastAttemptAt','')
        if out['health'].get(sid,{}).get('status')=='stale' and failed[:10]==stamp[:10]: continue
        if last and now-datetime.fromisoformat(last)<timedelta(days=30) and all(t['id'] in previous for t in targets): continue
        try:
            raw=fetch_public(source['url'])
            if source['format']=='pdf':
                from pypdf import PdfReader
                if not raw.startswith(b'%PDF'): raise ValueError('not PDF')
                texts=[p.extract_text() or '' for p in PdfReader(io.BytesIO(raw)).pages]
            else: texts=[plain(raw.decode('utf8'))]
            matches=[]
            for target in targets:
                term=target.get('matchName',target['name'])
                pages=[i+1 for i,t in enumerate(texts) if term in re.sub(r'\s+','',t)]
                if not pages: continue
                meta={'id':sid,'name':source['name'],'url':source['url'],'publishedAt':'','collectedAt':stamp,'basisVersion':'CATALOG-IDENTITY-V1','quality':'verified','note':f'目录身份见第{pages[0]}页；发布日期未提取，不用于价格/流动性评分。'}
                p=base_project(target,'hangzhou',meta)
                previous.setdefault(target['id'],p)
                previous[target['id']]['source']=meta
                matches.append({'id':target['id'],'name':target['name'],'page':pages[0]})
            # Archive selected public identity facts only, never lottery participant names or contact details.
            (archive/f'{sid}-{now.strftime("%H%M%S")}.json').write_text(json.dumps({'url':source['url'],'sha256':hashlib.sha256(raw).hexdigest(),'collectedAt':stamp,'matches':matches},ensure_ascii=False,indent=2),encoding='utf8')
            out['health'][sid]={'status':'verified' if len(matches)==len(targets) else 'partial','lastSuccessAt':stamp,'matched':len(matches),'expected':len(targets)}
        except Exception as e:
            out['health'][sid]={**out['health'].get(sid,{}),'status':'stale','error':type(e).__name__,'lastAttemptAt':stamp}
            for p in previous.values():
                if p['source']['id']==sid: p['source']['quality']='stale'
    collect_discovery(cfg,previous,out['health'],archive,now,retry_discovery)
    targets={t['number']:t for t in cfg['nanjing']}
    for p in previous.values():
        if p.get('officialProjectNumber'):
            targets.setdefault(p['officialProjectNumber'],{'id':p['id'],'name':p['name'],'number':p['officialProjectNumber'],'housingType':p.get('housingType','unknown')})
    try:
        for target in discover_nj(fetch_public(NJ_INDEX).decode('utf8')):
            targets.setdefault(target['number'],target)
        out['health']['nj-discovery']={'status':'verified','lastSuccessAt':stamp,'boundedNewLimit':MAX_NEW}
    except Exception as e: out['health']['nj-discovery']={'status':'stale','error':type(e).__name__}
    # Bound refresh work; rotate by oldest observation so expanding catalogs cannot monopolize the job.
    ordered=sorted(targets.values(),key=lambda t:previous.get(t['id'],{}).get('salesHistory',[{'observedAt':''}])[-1]['observedAt'])[:40]
    for target in ordered:
        url=f"https://www.njhouse.com.cn/project/info/{target['number']}/homePage.html"
        try:
            raw=fetch_public(url); fields=parse_nj(raw.decode('utf8'),target['name'])
            meta={'id':target['id'],'name':'南京网上房地产·官方项目销售公示','url':url,'publishedAt':'','collectedAt':stamp,'basisVersion':'NJHOUSE-ALL-USES-CUMULATIVE-V1','quality':'verified','note':'查询日快照；公示累计成交包含页面所有用途，可能含车位/商业，不是二手住宅成交。'}
            p=previous.get(target['id'],base_project(target,'nanjing',meta))
            p.update({k:fields[k] for k in ['address','developer']})
            if fields['district'] in NJ_DISTRICTS: p['district']=fields['district']
            p.update(source=meta,officialProjectNumber=target['number'])
            point={'observedAt':stamp,'sourceUrl':url,'basisVersion':meta['basisVersion'],'scope':'all-project-uses','uses':fields['usage'],**fields['counts']}
            p['salesHistory']=append_history(p.get('salesHistory',[]),point)
            p['inventory']={k:fields['counts'][k] for k in ['total','sold','available']}
            (archive/f"{target['id']}-{now.strftime('%H%M%S')}.json").write_text(json.dumps({'project':p,'sourceSha256':hashlib.sha256(raw).hexdigest()},ensure_ascii=False,indent=2),encoding='utf8')
            previous[target['id']]=p
            out['health'][target['id']]={'status':'verified','lastSuccessAt':stamp}
        except Exception as e:
            out['health'][target['id']]={**out['health'].get(target['id'],{}),'status':'stale','error':type(e).__name__,'lastAttemptAt':stamp}
            if target['id'] in previous and previous[target['id']]['source']['id']==target['id']:
                previous[target['id']]['source']['quality']='stale'
        time.sleep(.25)
    out.update(projects=list(previous.values()),generatedAt=stamp,complete=False)
    DEST.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    return out


if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--discovery-only',action='store_true',help='Only refresh identity discovery, without project sales requests or ingest')
    parser.add_argument('--retry-discovery',action='store_true',help='Retry same-day parser/transport failures once; HTTP rejections remain blocked')
    args=parser.parse_args()
    out=collect_catalog(args.discovery_only,args.retry_discovery)
    print(json.dumps({'projects':len(out['projects']),'salesSnapshots':sum(bool(p.get('salesHistory')) for p in out['projects']),'health':out['health']},ensure_ascii=False))
