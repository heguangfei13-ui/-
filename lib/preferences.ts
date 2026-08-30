import type { City, ProjectSnapshot } from './types';
import { DEFAULT_BASKETS, type EmploymentCenter } from './decision-adapter';
import type { UseCase } from './decision-model';

export interface Preferences {
  city: City; purchaseYear: number; cash: number; budgetMin: number; budgetMax: number;
  areaMin: number; areaMax: number; housingType: 'new' | 'resale' | 'all'; useCase: UseCase;
  school: boolean; commuteMode: 'transit' | 'drive'; baskets: Record<City, EmploymentCenter[]>;
  loan: number; years: number; rateSpread: number; parking: number; fitout: number; taxReserve: number;
}
export const DEFAULT_PREFERENCES: Preferences = { city:'hangzhou',purchaseYear:2027,cash:600,budgetMin:500,budgetMax:800,areaMin:110,areaMax:140,housingType:'new',useCase:'balanced',school:false,commuteMode:'transit',baskets:DEFAULT_BASKETS as Record<City, EmploymentCenter[]>,loan:200,years:30,rateSpread:0,parking:30,fitout:40,taxReserve:30 };
export function validatePreferences(input: unknown): Preferences {
  if (!input || typeof input !== 'object') throw new Error('设置格式不正确');
  const p = input as Preferences;
  for (const [key,min,max] of [['purchaseYear',2026,2060],['cash',0,100000],['budgetMin',0,100000],['budgetMax',1,100000],['areaMin',10,2000],['areaMax',10,2000],['loan',0,100000],['years',1,30],['rateSpread',-500,1500],['parking',0,10000],['fitout',0,10000],['taxReserve',0,10000]] as const) {
    if (typeof p[key] !== 'number' || !Number.isFinite(p[key]) || p[key] < min || p[key] > max) throw new Error(`${key} 超出范围`);
  }
  if(p.budgetMin > p.budgetMax || p.areaMin > p.areaMax) throw new Error('下限不能高于上限');
  if (!Number.isInteger(p.years) || !Number.isInteger(p.purchaseYear)) throw new Error('年份和期限须为整数');
  if (!['hangzhou','nanjing'].includes(p.city) || !['new','resale','all'].includes(p.housingType) || !['home','balanced','investment'].includes(p.useCase) || !['transit','drive'].includes(p.commuteMode) || typeof p.school !== 'boolean') throw new Error('选项无效');
  const baskets = {} as Preferences['baskets'];
  for (const city of ['hangzhou','nanjing'] as const) {
    const items = p.baskets?.[city]; const defaults = DEFAULT_BASKETS[city];
    if(!Array.isArray(items) || items.length !== defaults.length || items.some((x,i)=>x.id !== defaults[i].id || typeof x.weight !== 'number' || !Number.isFinite(x.weight) || x.weight<0 || x.weight>100) || Math.abs(items.reduce((s,x)=>s+x.weight,0)-100)>0.001) throw new Error('每座城市就业中心权重之和须为100%');
    baskets[city] = items.map((x,i)=>({...defaults[i],weight:x.weight}));
  }
  return Object.fromEntries(Object.keys(DEFAULT_PREFERENCES).map(k=>[k,k==='baskets'?baskets:p[k as keyof Preferences]])) as unknown as Preferences;
}
export function budgetMatch(project: ProjectSnapshot, p: Preferences) {
  const reasons: string[] = [];
  if(p.housingType==='resale') reasons.push('当前项目为新房');
  const [min,max]=project.areaRange;
  if(min!==null && max!==null && (max<p.areaMin || min>p.areaMax)) reasons.push('面积不匹配');
  const [lo,hi]=project.totalCostRange;
  if(lo!==null && hi!==null && (hi<p.budgetMin || lo>p.budgetMax)) reasons.push('总成本不匹配');
  return {status:reasons.length?'excluded':min!==null&&max!==null&&lo!==null&&hi!==null?'matched':'unknown',reasons};
}
export function cashflow(p: Preferences, lpr: number) {
  const rate=Math.max(0,lpr+p.rateSpread/100),r=rate/1200,n=p.years*12,principal=p.loan*10000;
  const payment=r===0?principal/n:principal*r*(1+r)**n/((1+r)**n-1);
  return {rate,payment,interest:payment*n-principal,houseBudget:Math.min(p.budgetMax,p.cash+p.loan)-p.parking-p.fitout-p.taxReserve,reserves:p.parking+p.fitout+p.taxReserve};
}
