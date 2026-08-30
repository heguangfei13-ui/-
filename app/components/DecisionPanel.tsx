'use client';
import { useMemo, useState } from 'react';
import type { DashboardData } from '@/lib/types';
import { assessDashboard, DEFAULT_BASKETS, hierarchy } from '@/lib/decision-adapter';
import { CYCLE_LABELS, MODEL, PLANNING_DISCOUNTS, PLANNING_LABELS, USE_CASES, cityCoefficient, combineScores, scoreAxis, type ScoreResult, type UseCase } from '@/lib/decision-model';

const number = (value: number | null | undefined) => value == null ? '—' : Number(value.toFixed(1)).toString();
function ScoreCard({ title, result, active, onClick }: { title: string; result: ScoreResult; active: boolean; onClick: () => void }) {
  return <button className={`decision-score ${active ? 'selected' : ''}`} aria-pressed={active} onClick={onClick}><span>{title}</span><strong>{number(result.score)}<small>/100</small></strong><span>置信度 {result.confidence}%</span><progress value={result.confidence} max={100} /><small>目标指标覆盖 {result.coverage}% · {result.status === 'sufficient' ? '证据较充分' : result.score === null ? '暂无可计分证据' : '部分证据评分'}</small></button>;
}
function Explanation({ result }: { result: ScoreResult }) {
  return <div className="explain-score"><div className="explain-columns"><div><b>主要加分项</b>{result.plus.length ? result.plus.map((s) => <p key={s}>＋ {s}</p>) : <p>暂无可核验的加分项</p>}</div><div><b>主要扣分项</b>{result.minus.length ? result.minus.map((s) => <p key={s}>－ {s}</p>) : <p>暂无已证实的扣分项，不代表没有风险</p>}</div></div>
    <details><summary>Explain Score · 查看原值、公式、来源与排除原因</summary>
      {result.dimensions.map((d) => <section key={d.id} className="dimension-evidence"><h4>{d.label} · 预设 {d.weight}% · 得分 {number(d.score)} · 贡献 {number(d.contribution)} · 置信度 {d.confidence}%</h4>{d.metrics.map((m) => <div key={m.id} className="evidence-row"><b>{m.label}</b><span>{m.score === null ? '未计分' : `${number(m.value)}${m.unit} → ${m.score}分`} · 统计期 {m.period ?? '无'}</span><small>{m.reason}</small>{m.score !== null && <small>{m.rule}</small>}{m.sources.map((s) => <a key={s.url} href={s.url} target="_blank" rel="noreferrer">{s.publisher} · 发布 {s.publishedAt.slice(0, 10)} · 采集 {s.collectedAt.slice(0, 10)} ↗</a>)}</div>)}</section>)}
    </details></div>;
}

export default function DecisionPanel({ data }: { data: DashboardData }) {
  const [useCase, setUseCase] = useState<UseCase>('balanced');
  const [schoolWeight, setSchoolWeight] = useState(0);
  const [basket, setBasket] = useState(DEFAULT_BASKETS[data.city] ?? []);
  const [areaId, setAreaId] = useState('');
  const [communityId, setCommunityId] = useState('');
  const [listingId, setListingId] = useState('');
  const [explain, setExplain] = useState<'timing' | 'fundamentals' | 'district' | 'asset'>('timing');
  const asOf = new Date().toISOString().slice(0, 10) + 'T23:59:59Z';
  const assessment = useMemo(() => assessDashboard(data, asOf, useCase, schoolWeight, basket), [data, asOf, useCase, schoolWeight, basket]);
  const nodes = hierarchy(data), areas = nodes.filter((n) => n.layer === 'district');
  const communities = data.projects.filter((p) => !areaId || (p.marketAreaId ?? `${data.city}:unassigned`) === areaId);
  const selected = communities.find((p) => p.id === communityId);
  const listings = (data.listings ?? []).filter((l) => l.parentId === selected?.id);
  const listing = listings.find((l) => l.id === listingId);
  const area = areas.find((n) => n.id === areaId);
  const district = scoreAxis('district', area?.observations ?? [], asOf);
  const localTiming = area?.observations.some((o) => MODEL.timing.some((d) => d.metrics.some((m) => m.id === o.metric))) ? scoreAxis('timing', area.observations, asOf) : assessment.timing;
  const projectResult = assessment.projects.find((p) => p.id === selected?.id);
  const asset = listing ? scoreAxis('asset', [...(selected?.assetEvidence ?? []).filter((o) => !listing.observations.some((l) => l.metric === o.metric)), ...listing.observations], asOf, schoolWeight) : projectResult?.asset ?? scoreAxis('asset', [], asOf, schoolWeight);
  const combined = combineScores(localTiming, asset, assessment.fundamentals, useCase);
  const results = { timing: localTiming, fundamentals: assessment.fundamentals, district, asset };
  const titles = { timing: '购房时机', fundamentals: '城市长期基本面', district: '板块质量', asset: '小区 / 房源资产质量' };
  return <section className="decision-panel panel" aria-labelledby="decision-title">
    <div className="panel-head"><div><p>DECISION ENGINE · V{assessment.version}</p><h2 id="decision-title">时机与好资产，是两个问题</h2></div><label>购房用途<select aria-label="购房用途" value={useCase} onChange={(e) => setUseCase(e.target.value as UseCase)}>{Object.entries(USE_CASES).map(([id, w]) => <option key={id} value={id}>{w.label} · {w.timing * 100}/{w.asset * 100}</option>)}</select></label></div>
    <p className="decision-intro">不预测短期涨跌。用可追溯证据判断市场阶段、长期资产质量和具体购买价值；空缺不补假数据，也不让一个空缺阻断全部分项。</p>
    <nav className="decision-drill" aria-label="五层数据下钻"><span>中国宏观 → {data.cityName}</span><label>→ 板块<select value={areaId} onChange={(e) => { setAreaId(e.target.value); setCommunityId(''); setListingId(''); }}><option value="">全城范围</option>{areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label>→ 小区<select value={communityId} onChange={(e) => { setCommunityId(e.target.value); setListingId(''); }}><option value="">请选择小区</option>{communities.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>→ 具体房源<select value={listingId} onChange={(e) => setListingId(e.target.value)} disabled={!listings.length}><option value="">{listings.length ? '选择房源' : '尚无核验房源'}</option>{listings.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label></nav>
    {areaId.endsWith(':unassigned') && <p className="decision-caveat">行政区不等于市场板块；尚无可靠边界和归属时，不编造板块名或分数。</p>}
    {area && localTiming === assessment.timing && <p className="decision-caveat">板块时机数据不足，下方时机分沿用“城市背景信号”，不标为板块独立判断。</p>}
    <div className="decision-score-grid">{(['timing', 'fundamentals', 'district', 'asset'] as const).map((axis) => <ScoreCard key={axis} title={titles[axis]} result={results[axis]} active={explain === axis} onClick={() => setExplain(axis)} />)}</div>
    <div className="decision-total"><div><small>{combined.full ? '最终综合评分' : '可用维度参考分 · 非最终综合评分'}</small><strong>{number(combined.full ? combined.score : combined.baseScore)}</strong><span>{combined.recommendation}</span></div><div><p>时机 × {combined.weights.timing * 100}% ＋ 资产 × {combined.weights.asset * 100}%</p><p>再乘城市长期系数 {number(cityCoefficient(assessment.fundamentals.score))} · 最终置信度 {combined.confidence}%</p><p>{combined.note}</p>{combined.warning && <b role="note">△ {combined.warning}</b>}</div></div>
    <p className="decision-caveat">分数是透明的规则映射，不是官方评级。置信度是证据充足度，不是获利概率；低覆盖率分数不可与高覆盖率分数直接排榜。无完整资产证据时，不能仅凭城市时机判断这套房值得买。</p>
    <Explanation result={results[explain]} />

    <div className="cycle-head"><h3>房地产周期</h3><span>{assessment.cycle.state === null ? '暂无法确认阶段' : CYCLE_LABELS[assessment.cycle.state - 1]} · 置信度 {assessment.cycle.confidence}%</span></div>
    <ol className="cycle-track">{CYCLE_LABELS.map((label, i) => <li key={label} className={`${assessment.cycle.state === i + 1 ? 'current' : ''} ${i >= 4 && i <= 6 ? 'research-window' : ''}`}><b>{i + 1}</b><span>{label}</span></li>)}</ol>
    <p className="decision-caveat">{assessment.cycle.reason}。候选：{assessment.cycle.candidate === null ? '无' : CYCLE_LABELS[assessment.cycle.candidate - 1]}；绿色/朱红边框的5→6→7为优先研究窗口。</p>
    <details><summary>关键趋势 · 当前值、环比、同比、MA与斜率</summary><div className="decision-table-scroll"><table className="decision-table"><thead><tr><th>指标</th><th>当前</th><th>环比%</th><th>同比%</th><th>MA3</th><th>MA6</th><th>MA12</th><th>6月斜率</th></tr></thead><tbody>{Object.entries(assessment.trends).map(([key, t]) => <tr key={key}><th>{{ price: '二手价格环比指数', volume: '二手成交套数', inventory: '二手挂牌套数', bargaining: '议价率%' }[key]}</th><td>{number(t.current)}</td><td>{key === 'price' ? '见价格卡片¹' : number(t.mom)}</td><td>{key === 'price' ? '见价格卡片¹' : number(t.yoy)}</td><td>{number(t.ma3)}</td><td>{number(t.ma6)}</td><td>{number(t.ma12)}</td><td>{number(t.slope)}</td></tr>)}</tbody></table></div><p className="decision-caveat">¹ 环比指数的同比变化不等于房价同比，禁止混用。仅对连续、同口径月份计算移动均值；缺月份不填0，不跨基期拼接。年度基本面不伪造月度趋势。</p></details>

    <details><summary>个性化 · 就业中心篮子与学区开关</summary><div className="basket-settings">{basket.map((center, index) => <label key={center.id}>{center.name}<input type="number" min={0} max={100} value={center.weight} onChange={(e) => setBasket(basket.map((c, i) => i === index ? { ...c, weight: Math.max(0, Math.min(100, Number(e.target.value) || 0)) } : c))} />%</label>)}</div><p className="decision-caveat">篮子权重按填写值归一化；未测中心仍计入覆盖率分母。仅接受包含步行、候车、换乘或停车进出的高峰门到门时间。现有普通地图路线估计不计入这个分数。</p><label className="school-toggle"><input type="checkbox" checked={schoolWeight > 0} onChange={(e) => setSchoolWeight(e.target.checked ? 5 : 0)} />主动开启学区需求（默认0，开启后5%，其余资产权重同比缩放）</label></details>
    <details><summary>规划折扣与模型边界</summary><div className="planning-factors">{Object.entries(PLANNING_DISCOUNTS).map(([status, factor]) => <span key={status}>{PLANNING_LABELS[status as keyof typeof PLANNING_LABELS]} × {factor}</span>)}</div><p className="decision-caveat">折扣为可审计的模型假设，不是兑现概率。仅用于潜在配套收益；未来住宅供应另外显示确定量与潜在量，不能把规划风险折扣成零。3/5公里供应调查不完整时，不认定“稀缺”。</p></details>
  </section>;
}
