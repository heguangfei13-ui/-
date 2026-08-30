"""Fetch original NBS tables and public NJ project/permit records; archive before use."""
from __future__ import annotations
import io,json,re,time,sys,subprocess
from pathlib import Path
from datetime import datetime
from urllib.parse import urljoin
from urllib.request import Request,urlopen
from pypdf import PdfReader
try:
    from .collect import fetch,strip_html,parse_nbs_prices,parse_fundamentals,ANNUAL_SOURCES,TZ,USER_AGENT
except ImportError:
    from collect import fetch,strip_html,parse_nbs_prices,parse_fundamentals,ANNUAL_SOURCES,TZ,USER_AGENT

NBS_HISTORY=[
 'https://www.stats.gov.cn/sj/zxfbhjd/202602/t20260213_1962617.html',
 'https://www.stats.gov.cn/sj/zxfb/202603/t20260316_1962774.html',
 'https://www.stats.gov.cn/sj/zxfb/202604/t20260416_1963320.html',
 'https://www.stats.gov.cn/sj/zxfb/202605/t20260518_1963715.html',
 'https://www.stats.gov.cn/sj/zxfb/202606/t20260616_1963946.html',
 'https://www.stats.gov.cn/sj/zxfbhjd/202607/t20260715_1964115.html',
 'https://www.stats.gov.cn/sj/zxfbhjd/202608/t20260817_1965050.html',
]
NJ_PROJECTS={'nj-yuemanyunchuanfu':('4596200','樾满云川府'),'nj-binheyuncheng':('109026','滨河云城'),'nj-jinxiuchengyuefu':('4099150','锦绣前程悦府')}

def source_html(url):
    # Normal verified HTTPS, not an access-control bypass. Windows urllib has TLS failures on NBS.
    if sys.platform=='win32' and 'www.stats.gov.cn/' in url:
        result=subprocess.run(['curl.exe','-sS','--fail','--max-time','20',url],capture_output=True,check=True)
        return result.stdout.decode('utf8')
    return fetch(url,0)[0]

def parse_project(html,name):
    plain=re.sub(r'\s+','',strip_html(html))
    if name not in plain or '入网总套数' not in plain: raise ValueError('project identity/table missing')
    def cell(label):
        m=re.search(r'<t[dh][^>]*>\s*'+label+r'\s*</t[dh]>\s*<td[^>]*>(.*?)</td>',html,re.S)
        return strip_html(m[1]) if m else None
    counts={}
    for key,label in [('total','入网总套数'),('sold','总成交套数'),('available','未售总套数')]:
        m=re.search(label+r'(\d+)套',plain)
        if m:counts[key]=int(m[1])
    links=re.findall(r'webPermitHtml\?permitId=(\d+)["\'][^>]*>(.*?)</a>',html,re.S)
    ids=list(dict.fromkeys([i for i,t in links if '预售方案' in strip_html(t)]+[i for i,t in links]))
    return {'address':cell('项目地址'),'developer':cell('开发企业'),'inventory':counts,'permitIds':ids}

def parse_permit(text,name):
    plain=re.sub(r'\s+','',text)
    if name not in plain:raise ValueError('permit belongs to different project')
    result={}
    for key,pattern,low,high in [('floorAreaRatio',r'容积率([\d.]+)',0.1,12),('greenRatio',r'绿地率([\d.]+)%',0,100)]:
        m=re.search(pattern,plain)
        if m:
            value=float(m[1])
            if not low<=value<=high:raise ValueError('invalid physical indicator')
            result[key]=value
    return result

def collect_enrichment():
    now=datetime.now(TZ);stamp=now.isoformat();folder=Path('data/archive')/now.strftime('%Y/%m/%d')/'evidence';folder.mkdir(parents=True,exist_ok=True)
    destination=Path('data/verified-enrichment.json')
    out=json.loads(destination.read_text(encoding='utf8')) if destination.exists() else {'prices':[],'projects':{},'health':{}}
    urls=list(NBS_HISTORY)
    try:
        html=source_html('https://www.stats.gov.cn/sj/zxfb/')
        for href,title in re.findall(r'<a[^>]+href=["\']([^"\']+)["\'][^>]*>(.*?)</a>',html,re.S):
            if re.search(r'20\d{2}年\d{1,2}月份70个大中城市商品住宅销售价格变动情况',strip_html(title)):
                url=urljoin('https://www.stats.gov.cn/sj/zxfb/',href)
                if url.startswith('https://www.stats.gov.cn/'):urls.append(url)
    except Exception as e:out['health']['nbs-discovery']={'status':'stale','error':type(e).__name__}
    for url in list(dict.fromkeys(urls)):
        try:
            html=source_html(url); parsed=parse_nbs_prices(html)
            if parsed['period']>now.strftime('%Y-%m'):raise ValueError('future release')
            (folder/f'nbs-{parsed["period"]}.html').write_text(html,encoding='utf8')
            parsed.update(sourceUrl=url,collectedAt=stamp)
            out['prices']=[p for p in out['prices'] if p['period']!=parsed['period']]+[parsed]
            out['health'][url]={'status':'verified','collectedAt':stamp}
        except Exception as e:out['health'][url]={'status':'stale','error':type(e).__name__}
        time.sleep(.2)
    for project_id,(number,name) in ({} if '--prices-only' in sys.argv else NJ_PROJECTS).items():
        url=f'https://www.njhouse.com.cn/project/info/{number}/homePage.html'
        try:
            html,_=fetch(url,0); fields=parse_project(html,name)
            (folder/f'{project_id}.html').write_text(html,encoding='utf8')
            previous=out['projects'].get(project_id,{})
            observations=previous.get('assetEvidence',[])
            # Read up to 3 published schemes; older schemes remain dated, not refreshed as new facts.
            for permit in fields.pop('permitIds')[:3]:
                permit_url=f'https://www.njhouse.com.cn/jsmart/nj/web/webPermitHtml?permitId={permit}'
                try:
                    with urlopen(Request(permit_url,headers={'User-Agent':USER_AGENT}),timeout=30) as response:raw=response.read()
                    if not raw.startswith(b'%PDF'):raise ValueError('not a PDF')
                    (folder/f'nj-permit-{permit}.pdf').write_bytes(raw)
                    text='\n'.join(p.extract_text() or '' for p in PdfReader(io.BytesIO(raw)).pages)
                    values=parse_permit(text,name)
                    date=re.search(r'申报日期\s*(\d{4}-\d{1,2}-\d{1,2})',text)
                    if not date:continue
                    published=datetime.strptime(date[1],'%Y-%m-%d').strftime('%Y-%m-%d')
                    for metric,value in values.items():
                        obs={'metric':metric,'value':value,'period':published,'basis':f'NJ-PERMIT-{permit}','frequency':'snapshot','verified':True,'completeness':.6,'method':'official-statistic','note':'官方公示开发企业申报的设计参数；仅产品密度/园林子项，不代表交付品质、地段或流动性。','sources':[{'publisher':'南京网上房地产·公示预售方案','url':permit_url,'publishedAt':published,'collectedAt':stamp,'kind':'official-reprint','independentGroup':f'NJ-PROJECT-{number}'}]}
                        observations=[o for o in observations if o['metric']!=metric or o['period']>published]
                        if not any(o['metric']==metric and o['period']>published for o in observations):observations.append(obs)
                    if values:break
                except Exception as e:out['health'][permit_url]={'status':'stale','error':type(e).__name__}
            source={'id':project_id,'name':'南京网上房地产·项目公示','url':url,'publishedAt':now.strftime('%Y-%m-%d'),'collectedAt':stamp,'basisVersion':'NJHOUSE-PROJECT','quality':'verified','note':'项目入网总数可能包括车位；不得当作住宅总户数或二手流动性。'}
            address=fields.get('address') or previous.get('address') or ''
            area='淳化街道' if '淳化街道' in address else '江宁滨江（太白路—景明大街）' if number=='4099150' else '板桥' if '板桥' in address else None
            out['projects'][project_id]={**previous,**{k:v for k,v in fields.items() if v},'assetEvidence':observations,'source':source}
            if area:out['projects'][project_id].update(marketAreaName=area,marketAreaId='nanjing:'+('chunhua' if number=='4596200' else 'binjiang' if number=='4099150' else 'banqiao'))
            out['health'][project_id]={'status':'verified','indicators':len(observations),'collectedAt':stamp}
        except Exception as e:out['health'][project_id]={'status':'stale','error':type(e).__name__}
    out['prices'].sort(key=lambda p:p['period']);out['generatedAt']=stamp
    # Reuse already archived, successfully ingested annual evidence for the offline bootstrap.
    out.setdefault('fundamentals',{})
    for sid,config in ANNUAL_SOURCES.items():
        html_path=folder.parent/f'{sid}.html';run_path=folder.parent/'run.json'
        if html_path.exists() and run_path.exists():
            observed=datetime.fromisoformat(json.loads(run_path.read_text(encoding='utf8'))['payload_meta']['observed_at'])
            try:
                observations=parse_fundamentals(html_path.read_text(encoding='utf8'),sid,observed)
                out['fundamentals'][sid]={'city':config['city'],'observations':observations}
            except ValueError:pass
    destination.write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps({'price_months':len(out['prices']),'projects':{k:len(v.get('assetEvidence',[])) for k,v in out['projects'].items()}},ensure_ascii=False))
    return out
if __name__=='__main__':collect_enrichment()
