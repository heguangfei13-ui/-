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
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, build_opener, HTTPRedirectHandler
from html import unescape

ROOT = Path(__file__).resolve().parents[1]
TZ = timezone(timedelta(hours=8))
CONFIG = ROOT / 'data/catalog-sources.json'
DEST = ROOT / 'data/community-catalog.json'
NJ_INDEX = 'https://www.njhouse.com.cn/projectindex.html'
MAX_NEW = 16


def plain(html):
    html = re.sub(r'<(script|style)\b[^>]*>.*?</\1>', '', html, flags=re.S|re.I)
    return unescape(re.sub(r'<[^>]+>', ' ', html))


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def fetch_public(url):
    host = urlparse(url).hostname
    if urlparse(url).scheme != 'https' or host not in {
        'www.njhouse.com.cn', 'www.hz-notary.com',
        'zjjcmspublic.oss-cn-hangzhou-zwynet-d01-a.internet.cloud.zj.gov.cn',
    }:
        raise ValueError('source outside allowlist')
    with build_opener(NoRedirect()).open(Request(url, headers={'User-Agent':'HomeCompass/1.0 public-source daily research'}), timeout=25) as response:
        raw = response.read(24_000_001)
    if len(raw) > 24_000_000:
        raise ValueError('source too large')
    return raw


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


def collect_catalog():
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
        except Exception as e: out['health'][sid]={**out['health'].get(sid,{}),'status':'stale','error':type(e).__name__,'lastAttemptAt':stamp}
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
            p.update({k:fields[k] for k in ['address','developer','district']})
            p.update(source=meta,officialProjectNumber=target['number'])
            point={'observedAt':stamp,'sourceUrl':url,'basisVersion':meta['basisVersion'],'scope':'all-project-uses','uses':fields['usage'],**fields['counts']}
            p['salesHistory']=append_history(p.get('salesHistory',[]),point)
            p['inventory']={k:fields['counts'][k] for k in ['total','sold','available']}
            (archive/f"{target['id']}-{now.strftime('%H%M%S')}.json").write_text(json.dumps({'project':p,'sourceSha256':hashlib.sha256(raw).hexdigest()},ensure_ascii=False,indent=2),encoding='utf8')
            previous[target['id']]=p
            out['health'][target['id']]={'status':'verified','lastSuccessAt':stamp}
        except Exception as e: out['health'][target['id']]={**out['health'].get(target['id'],{}),'status':'stale','error':type(e).__name__,'lastAttemptAt':stamp}
        time.sleep(.25)
    out.update(projects=list(previous.values()),generatedAt=stamp,complete=False)
    DEST.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    return out


if __name__=='__main__':
    out=collect_catalog()
    print(json.dumps({'projects':len(out['projects']),'salesSnapshots':sum(bool(p.get('salesHistory')) for p in out['projects']),'health':out['health']},ensure_ascii=False))

