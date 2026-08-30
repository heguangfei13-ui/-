'use client';
import Navigation from '../components/Navigation';
import {usePreferences} from '../components/PreferencesProvider';
import {useDashboard} from '../components/useDashboard';
import {cashflow} from '@/lib/preferences';
export default function Cashflow(){
  const {preferences:p}=usePreferences(),{data}=useDashboard(p.city);
  const metric=data.metrics.find(x=>x.sourceId==='lpr'),source=data.sources.find(x=>x.id==='lpr');
  const lpr=metric?Number.parseFloat(metric.value):NaN,result=Number.isFinite(lpr)?cashflow(p,lpr):null;
  return <main className={`dashboard city-${p.city}`}><Navigation active="cashflow"/><div className="workspace"><header className="page-title"><p>CASHFLOW LAB</p><h1>贷款与现金流</h1><span>与你的购房设置联动 · 等额本息</span><a className="text-action" href="/settings">修改资金设置 →</a></header>
    {result?<><section className="finance-hero panel"><div><span>可用于房屋本体的预算</span><strong>{result.houseBudget.toFixed(0)} <small>万元</small></strong><p>现金与贷款合计 {p.cash+p.loan} 万；总成本上限 {p.budgetMax} 万；扣除预留 {result.reserves} 万。</p></div><div><span>每月还款</span><strong>{Math.round(result.payment).toLocaleString()} <small>元</small></strong><p>{p.years} 年 · 执行利率 {result.rate.toFixed(2)}%</p></div></section><div className="metric-grid"><article className="metric"><span>贷款本金</span><strong>{p.loan} 万</strong></article><article className="metric"><span>全期利息</span><strong>{(result.interest/10000).toFixed(1)} 万</strong></article><article className="metric"><span>车位与整备</span><strong>{p.parking+p.fitout} 万</strong></article><article className="metric"><span>税费及其他预留</span><strong>{p.taxReserve} 万</strong></article></div><section className="panel"><h2>利率压力测试</h2><div className="decision-table-scroll"><table className="decision-table"><thead><tr><th>情景</th><th>执行利率</th><th>每月还款</th><th>较当前月供</th></tr></thead><tbody>{[-50,0,50,100].map(bp=>{const s=cashflow({...p,rateSpread:p.rateSpread+bp},lpr);return <tr key={bp}><td>{bp===0?'当前设置':`${bp>0?'+':''}${bp} BP`}</td><td>{s.rate.toFixed(2)}%</td><td>{Math.round(s.payment).toLocaleString()} 元</td><td>{Math.round(s.payment-result.payment).toLocaleString()} 元</td></tr>;})}</tbody></table></div>{result.houseBudget<0&&<p role="alert">现金与贷款不足以覆盖预留费用，请调整设置。</p>}</section></>:<section className="panel">尚无有效利率快照，不能计算月供。</section>}
    <p className="muted">LPR 来源：<a href={source?.url} target="_blank" rel="noreferrer">{source?.name}</a> · 发布 {source?.publishedAt}。执行利率由 LPR 加设定的加点得出，最终以银行审批为准。</p></div></main>;
}
