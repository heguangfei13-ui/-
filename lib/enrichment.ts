import snapshot from '@/data/verified-enrichment.json';
import reviewed from '@/data/reviewed-project-facts.json';
import type {DashboardData,ProjectSnapshot} from './types';
type EnrichmentProject=Partial<ProjectSnapshot>&{marketAreaName?:string};
export function withVerifiedEvidence(original:DashboardData):DashboardData {
  const data=structuredClone(original),byPeriod=new Map(data.series.filter(p=>p.quality==='verified'&&p.sourceUrl).map(p=>[p.period,p]));
  for(const release of snapshot.prices){
    const r=release as {period:string;cities:Record<string,{new:number[];resale:number[]}>;sourceUrl:string;collectedAt:string};
    const c=r.cities[data.cityName];if(!c)continue;
    const old=byPeriod.get(r.period);if(old?.collectedAt&&old.collectedAt>r.collectedAt)continue;
    byPeriod.set(r.period,{period:r.period,newHomeIndex:c.new[0],resaleIndex:c.resale[0],volume:null,inventory:null,basisVersion:r.period>='2026-01'?'NBS-70CITY-2026':'NBS-70CITY-2021',quality:'verified',sourceUrl:r.sourceUrl,collectedAt:r.collectedAt});
  }
  data.series=[...byPeriod.values()].sort((a,b)=>a.period.localeCompare(b.period));
  data.macro=data.macro.filter(m=>m.sourceId!=='profile');
  const annual=(snapshot as unknown as {fundamentals?:Record<string,{city:string;observations:NonNullable<DashboardData['decisionEvidence']>}>}).fundamentals??{};
  for(const item of Object.values(annual))if(item.city===data.city){
    data.decisionEvidence??=[];
    for(const o of item.observations)if(!data.decisionEvidence.some(p=>p.metric===o.metric&&p.period>=o.period))data.decisionEvidence.push(o);
  }
  const areas=new Map((data.marketAreas??[]).map(a=>[a.id,a]));
  data.projects=data.projects.map(p=>{
    const curated=(reviewed as unknown as Record<string,EnrichmentProject>)[p.id];
    const extra=(snapshot.projects as Record<string,EnrichmentProject>)[p.id]??curated;if(!extra)return p;
    const merged={...p,...(curated&&p.source.id==='hz-tmsf'||extra.source&&extra.source.collectedAt>=p.source.collectedAt?extra:{}),assetEvidence:[...(p.assetEvidence??[]),...(extra.assetEvidence??[])]};
    merged.assetEvidence=[...new Map(merged.assetEvidence.sort((a,b)=>(a.sources[0]?.collectedAt??'').localeCompare(b.sources[0]?.collectedAt??'')).map(o=>[`${o.metric}:${o.basis}:${o.period}`,o])).values()];
    merged.marketAreaId=p.marketAreaId??extra.marketAreaId;
    if(extra.source&&!data.sources.some(s=>s.id===extra.source!.id))data.sources.push(extra.source);
    if(merged.marketAreaId&&extra.marketAreaName)areas.set(merged.marketAreaId,{id:merged.marketAreaId,name:extra.marketAreaName,layer:'district',parentId:data.city,cityId:data.city,observations:[],boundarySource:extra.source?.url});
    return merged;
  });
  data.marketAreas=[...areas.values()];return data;
}
