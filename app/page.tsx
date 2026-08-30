'use client';

import { useEffect, useMemo, useState } from 'react';
import MarketChart from './components/MarketChart';
import ProjectEvidence from './components/ProjectEvidence';
import DecisionPanel from './components/DecisionPanel';
import { assessDashboard } from '@/lib/decision-adapter';
import { dashboards } from '@/lib/bootstrap-data';
import { monthlyPayment } from '@/lib/scoring';
import type { City, DashboardData, ProjectSnapshot } from '@/lib/types';

const themes = { hangzhou: { accent: '#16745b' }, nanjing: { accent: '#a84235' } } as const;
const qualityText = { verified: '已核验', estimated: '模型值', stale: '已过期', pending: '待核验' } as const;

export default function Home() {
  const [city, setCity] = useState<City>('hangzhou');
  const [data, setData] = useState<DashboardData>(dashboards.hangzhou);
  const [range, setRange] = useState(12);
  const [selected, setSelected] = useState<ProjectSnapshot | null>(null);
  const [favorites, setFavorites] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem('home-compass-favorites') ?? '[]'); } catch { return []; }
  });
  const [loan, setLoan] = useState({ cash: 600, principal: 200, years: 30, rate: 3.5, parking: 30, fitout: 40 });

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/dashboard?city=${city}&range=${range}`, { signal: controller.signal }).then((r) => r.json()).then((result: unknown) => {
      if (!result || typeof result !== 'object' || !('data' in result)) return;
      const next = result.data as DashboardData | undefined;
      if (!controller.signal.aborted && next?.city === city) setData(next);
    }).catch(() => undefined);
    return () => controller.abort();
  }, [city, range]);

  const points = useMemo(() => {
    const verified = data.series.filter((p) => p.quality === 'verified' && p.sourceUrl);
    const latestBasis = verified.at(-1)?.basisVersion;
    return verified.filter((p) => p.basisVersion === latestBasis).slice(-range);
  }, [data.series, range]);
  const payment = monthlyPayment(loan.principal * 10_000, loan.rate, loan.years);
  const availableHomeBudget = loan.cash + loan.principal - loan.parking - loan.fitout;
  const hasStale = data.sources.some((source) => source.quality === 'stale');
  const decision = assessDashboard(data, new Date().toISOString());
  const toggleFavorite = (id: string) => { const next = favorites.includes(id) ? favorites.filter((item) => item !== id) : [...favorites, id]; setFavorites(next); localStorage.setItem('home-compass-favorites', JSON.stringify(next)); };
  const selectCity = (next: City) => { setCity(next); setData(dashboards[next]); setSelected(null); };

  return (
    <main className={`dashboard city-${city}`}>
      <nav className="topbar" aria-label="看板主导航">
        <a className="brand" href="#top"><span className="brand-mark">宅</span><span>置业罗盘</span></a>
        <div className="city-switch" aria-label="切换城市">{(['hangzhou', 'nanjing'] as City[]).map((item) => <button key={item} className={city === item ? 'active' : ''} onClick={() => selectCity(item)} aria-pressed={city === item}>{dashboards[item].cityName}</button>)}</div>
        <div className="freshness"><i className={hasStale ? 'warn' : ''} />数据更新至 {data.observedAt}</div>
      </nav>

      <section id="top" className="hero" style={{ '--hero-image': `url(${data.image})` } as React.CSSProperties}>
        <div className="hero-shade" />
        <div className="hero-content"><p className="eyebrow">{data.english} PROPERTY PULSE</p><h1>{data.cityName}<span>商品房监测</span></h1><p className="hero-region">{data.region}</p><div className="profile-pill"><span>2027 购房</span><b>600 万现金</b><span>500–800 万总成本</span><span>新房 · 110–140㎡</span></div></div>
        <div className="score-card"><div className="score-ring" style={{ '--score': `${(decision.timing.score ?? 0) * 3.6}deg` } as React.CSSProperties}><div><strong>{decision.timing.score ?? '—'}</strong><span>置信度 {decision.timing.confidence}%</span></div></div><div><small>城市时机 · 部分证据评分</small><h2>先看时机，再选资产</h2><p>可用指标独立计分；资产质量与城市长期基本面另算。低置信度不作购买结论。</p></div></div>
      </section>

      <section className="canvas">
        <DecisionPanel key={city} data={data} />
        {hasStale && <div className="data-alert"><b>△ 数据缺口已显式标记</b><span>一个或多个权威源本次采集未通过校验；系统没有绕过访问限制，也不会用估算值覆盖官方快照。自动任务将保留最后有效值并持续重试。</span></div>}
        <div className="section-head"><div><p>MARKET PULSE</p><h2>关键市场信号</h2></div><span>所有涨跌同时使用箭头与文字表达</span></div>
        <div className="metric-grid">{data.metrics.map((metric) => <article className="metric" key={metric.label}><div className="metric-top"><span>{metric.label}</span><em className={`quality ${metric.quality}`}>{qualityText[metric.quality]}</em></div><strong>{metric.value}</strong><p className={metric.direction}>{metric.direction === 'up' ? '↑' : metric.direction === 'down' ? '↓' : '→'} {metric.delta}</p></article>)}</div>

        <div className="analysis-grid">
          <article className="panel trend-panel"><div className="panel-head"><div><p>VERIFIED OBSERVATIONS</p><h3>住房价格观测</h3></div><div className="range-switch">{[12, 36, 60].map((r) => <button key={r} className={range === r ? 'active' : ''} onClick={() => setRange(r)}>{r} 月</button>)}</div></div>{points.length ? <MarketChart points={points} color={themes[city].accent} /> : <div className="market-chart">历史序列待回填；不展示示意曲线。</div>}<p className="chart-note">当前仅有 {points.length} 个月同基期核验观测，未满所选区间；成交与库存序列待补齐。指数 100 = 环比持平，◇ 为二手房；不同基期不连线。</p>{points.at(-1)?.sourceUrl && <a className="source-link" href={points.at(-1)!.sourceUrl} target="_blank" rel="noreferrer">国家统计局原表 · 采集 {points.at(-1)?.collectedAt?.slice(0, 10)} ↗</a>}</article>
          <article className="panel contribution-panel"><div className="panel-head"><div><p>AVAILABLE EVIDENCE</p><h3>时机分数贡献</h3></div><b>{decision.timing.score ?? '—'}</b></div><div className="contributions">{decision.timing.dimensions.map((part) => <div key={part.id}><div className="contribution-label"><span>{part.label} <i>{part.weight}%</i></span><strong>{part.score === null ? '未计分' : `+${part.contribution.toFixed(1)}`}</strong></div><div className="progress"><span style={{ width: `${part.coverage}%` }} /></div><small>{part.score === null ? '缺少有效证据，不用替代值' : `原权重内证据覆盖 ${part.coverage.toFixed(0)}% · 置信度 ${part.confidence}%`}</small></div>)}</div></article>
        </div>

        <div className="analysis-grid compact">
          <article className="panel"><div className="panel-head"><div><p>MACRO LENS</p><h3>宏观与信贷</h3></div></div><div className="macro-grid">{data.macro.map((item) => <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong><small>{item.change}</small></div>)}</div></article>
          <article className="panel"><div className="panel-head"><div><p>POLICY TIMELINE</p><h3>政策与数据日历</h3></div></div><ol className="timeline">{data.policies.map((item) => <li key={item.date + item.title}><time>{item.date}</time><div><b>{item.title}</b><span>{item.impact}</span></div></li>)}</ol></article>
        </div>

        <div className="section-head projects-head"><div><p>OFFICIAL WATCHLIST</p><h2>官方项目观察池</h2></div><span>证据不足的项目不进入推荐榜</span></div>
        <div className="watchlist-note"><b>当前 0 个项目满足“价格 + 户型 + 通勤”完整证据链</b><span>以下仅为官方预售/网签名单中的观察候选。待自动采集补齐目标户型总成本与高德通勤后，才会计算排名。</span></div>
        <div className="project-grid">{data.projects.map((project) => { const fastest = project.commutes.filter((c) => c.driveMinutes).sort((a, b) => (a.driveMinutes ?? 999) - (b.driveMinutes ?? 999))[0]; return <article className="project-card" key={project.id}><div className="project-card-top"><span>{project.district}</span><button onClick={() => toggleFavorite(project.id)} aria-label={favorites.includes(project.id) ? '取消收藏' : '收藏项目'}>{favorites.includes(project.id) ? '♥' : '♡'}</button></div><h3>{project.name}</h3><p className="developer">{project.developer}</p><div className="project-state"><b>{fastest ? `驾车 ${fastest.driveMinutes} 分钟` : '待核验'}</b><span>{fastest ? `至 ${fastest.destination}` : '价格 / 110–140㎡ / 通勤'}</span></div><div className="tag-row">{project.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>{project.inventory && <div className="inventory"><span>总 {project.inventory.total}</span><span>成交 {project.inventory.sold}</span><span>可售 {project.inventory.available}</span></div>}<button className="detail-button" onClick={() => setSelected(project)}>查看证据与风险 →</button></article>; })}</div>

        <div className="section-head"><div><p>CASHFLOW LAB</p><h2>贷款与现金流计算器</h2></div><span>等额本息 · 默认 5 年期以上 LPR</span></div>
        <article className="calculator panel"><div className="sliders">{([['cash', '可用现金', 200, 800, 10, '万'], ['principal', '贷款本金', 0, 500, 10, '万'], ['years', '贷款期限', 5, 30, 5, '年'], ['rate', '执行利率', 2.5, 5.5, 0.05, '%'], ['parking', '车位预算', 0, 80, 5, '万'], ['fitout', '基础整备', 0, 100, 5, '万']] as const).map(([key, label, min, max, step, unit]) => <label key={key}><span>{label}<b>{loan[key]} {unit}</b></span><input type="range" min={min} max={max} step={step} value={loan[key]} onChange={(e) => setLoan({ ...loan, [key]: Number(e.target.value) })} /></label>)}</div><div className="calculation-result"><small>建议可用于房屋本体</small><strong>{availableHomeBudget} 万</strong><div><span>月供</span><b>{Math.round(payment).toLocaleString('zh-CN')} 元</b></div><div><span>预算安全线</span><b>≤ 720 万</b></div><p>总成本上限仍建议控制在 720 万附近，为税费、车位与整备保留约 10% 空间。</p></div></article>

        <div className="section-head"><div><p>DATA PROVENANCE</p><h2>来源与健康状态</h2></div><span>页面读取已保存快照，不在访问时抓取</span></div>
        <div className="sources">{data.sources.map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.id}><div><b>{source.name}</b><em className={`quality ${source.quality}`}>{qualityText[source.quality]}</em></div><span>发布 {source.publishedAt} · 采集 {source.collectedAt.slice(0, 10)}</span><small>{source.note ?? `口径 ${source.basisVersion}`}</small></a>)}</div>
        <footer><span>置业罗盘 · 为 2027 做有证据的决定</span><span>信号仅供研究，不构成房价预测或投资建议</span></footer>
      </section>

        {selected && <ProjectEvidence project={selected} onClose={() => setSelected(null)} />}
    </main>
  );
}
