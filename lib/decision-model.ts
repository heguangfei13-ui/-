/** Evidence-first, city-independent decision model. Scores are policy heuristics, not forecasts. */
export const MODEL_VERSION = '2.0.0';
export type UseCase = 'home' | 'balanced' | 'investment';
export type Layer = 'macro' | 'city' | 'district' | 'community' | 'listing';
export type Axis = 'fundamentals' | 'timing' | 'district' | 'asset';
export const USE_CASES = { home: { label: '长期自住', timing: 0.3, asset: 0.7 }, balanced: { label: '自住兼投资', timing: 0.4, asset: 0.6 }, investment: { label: '投资', timing: 0.5, asset: 0.5 } } as const;
export const PLANNING_DISCOUNTS = { operational: 1, completed: 0.85, construction: 0.6, approved: 0.3, planned: 0.1, concept: 0 } as const;
export const PLANNING_LABELS = { operational: '已运营', completed: '已建成', construction: '施工中', approved: '已正式批复', planned: '规划中', concept: '概念规划' } as const;
export type PlanningStatus = keyof typeof PLANNING_DISCOUNTS;
export interface EvidenceSource { publisher: string; url: string; publishedAt: string; collectedAt: string; kind: 'official' | 'official-reprint' | 'routing' | 'unsupported'; independentGroup: string; }
export interface Observation {
  metric: string; value: number; period: string; basis: string; sources: EvidenceSource[];
  frequency: 'monthly' | 'annual' | 'snapshot'; verified: boolean; conflict?: boolean;
  completeness?: number; note?: string; method?: 'door-to-door-peak' | 'route-estimate' | 'official-statistic';
}
export interface Entity { id: string; name: string; layer: Layer; parentId?: string; cityId?: string; observations: Observation[]; boundarySource?: string; }
export interface MetricDefinition { id: string; label: string; weight: number; unit: string; anchors: readonly (readonly [number, number])[]; maxAgeDays: number; ruleNote: string; }
export interface Dimension { id: string; label: string; weight: number; metrics: MetricDefinition[]; }
const metric = (id: string, label: string, unit: string, anchors: readonly (readonly [number, number])[], maxAgeDays = 75, weight = 1, ruleNote = '透明规则映射，非官方评级；尚未经收益回测校准'): MetricDefinition => ({ id, label, unit, anchors, maxAgeDays, weight, ruleNote });
const growth = [[-5, 0], [0, 40], [5, 75], [10, 100]] as const;
const positive = [[0, 0], [50, 50], [100, 100]] as const;
const dimension = (id: string, label: string, weight: number, metrics: MetricDefinition[]): Dimension => ({ id, label, weight, metrics });

export const MODEL: Record<Axis, Dimension[]> = {
  fundamentals: [
    dimension('population', '人口吸引力', 20, [metric('residentGrowth', '常住人口同比', '%', [[-1, 0], [0, 40], [1, 80], [2, 100]], 550), metric('youngGrowth', '20–39岁人口同比', '%', growth, 550), metric('graduateRetention', '毕业生留存率', '%', positive, 550), metric('educatedInflow', '高学历人口净流入率', '%', growth, 550), metric('pupilGrowth', '小学生人数同比（人口信号）', '%', growth, 550), metric('hukouGrowth', '户籍人口同比', '%', growth, 550)]),
    dimension('employment', '高质量就业', 20, [metric('highPayJobsGrowth', '高薪招聘岗位同比', '%', growth, 100), metric('newJobsGrowth', '城镇新增就业同比', '%', growth, 550), metric('headquartersGrowth', '总部企业数量同比', '%', growth, 550), metric('recruitSalaryGrowth', '平均招聘薪资同比', '%', growth, 100)]),
    dimension('industry', '产业竞争力', 20, [metric('coreIndustryGrowth', '核心产业增长', '%', growth, 550, 40), metric('highTechShare', '高新技术产业占规上工业比重', '%', [[0, 0], [30, 50], [60, 80], [80, 100]], 550, 30), metric('clusterDepth', '产业集群深度（完整证据量表）', '/100', positive, 550, 30)]),
    dimension('income', '居民收入增长', 15, [metric('incomeGrowth', '居民人均可支配收入同比', '%', growth, 550)]),
    dimension('economy', '经济与财政实力', 10, [metric('gdpGrowth', '实际GDP同比', '%', growth, 550), metric('fiscalGrowth', '一般公共预算收入同比', '%', growth, 550)]),
    dimension('cityScarcity', '城市等级与稀缺性', 10, [metric('cityScarcity', '城市稀缺性（权威依据量表）', '/100', positive, 550)]),
    dimension('longSupply', '长期住宅供应', 5, [metric('longSupplyMonths', '长期住宅供应月数', '月', [[0, 100], [18, 80], [36, 40], [60, 0]], 400)]),
  ],
  timing: [
    dimension('resaleVolume', '二手房成交量', 15, [metric('resaleVolumeRecovery', '成交MA3相对MA12', '%', [[-30, 0], [0, 50], [15, 85], [30, 100]], 75), metric('resaleVolumeYoY', '连续成交同比信号', '%', [[-30, 0], [0, 50], [20, 90], [40, 100]], 75)]),
    dimension('price', '房价趋势', 15, [metric('resalePriceRecovery', '二手价格3/6个月企稳信号', '/100', positive), metric('corePriceRecovery', '核心板块3/6个月企稳信号', '/100', positive)]),
    dimension('resaleStock', '二手挂牌库存', 10, [metric('resaleMonths', '二手挂牌去化周期', '月', [[0, 80], [6, 90], [12, 65], [24, 20], [36, 0]])]),
    dimension('newStock', '新房库存', 10, [metric('newMonths', '住宅库存去化周期', '月', [[0, 70], [6, 85], [12, 90], [24, 40], [36, 0]])]),
    dimension('bargaining', '议价率', 10, [metric('bargainImprovement', '议价率3个月降幅', '百分点', [[-5, 0], [0, 50], [3, 90], [5, 100]])]),
    dimension('land', '土地市场', 10, [metric('landRecovery', '宅地成交与流拍趋势信号', '/100', positive, 120)]),
    dimension('credit', '信贷环境', 10, [metric('lpr5y', '5年期以上LPR', '%', [[2, 100], [3, 75], [4, 50], [5, 25], [6, 0]], 75, 1, '2%=100、3%=75、4%=50、5%=25、6%=0，线性插值；仅衡量基准融资成本，不代表实际房贷利率或买点')]),
    dimension('creditDemand', '居民信贷需求', 5, [metric('householdCreditGrowth', '居民中长期贷款同比', '%', growth, 100)]),
    dimension('policy', '房地产政策', 5, [metric('enactedPolicy', '已生效政策（证据量表）', '/100', positive, 180)]),
    dimension('valuation', '估值水平', 10, [metric('rentYieldSpread', '净租金收益率减融资成本', '百分点', [[-3, 0], [-1, 40], [0, 70], [2, 100]], 100)]),
  ],
  district: [
    dimension('commute', '就业中心门到门通勤', 20, [metric('commuteMinutes', '就业篮子加权高峰通勤', '分钟', [[15, 100], [30, 90], [45, 70], [60, 45], [90, 0]], 14)]),
    dimension('industry', '已落地产业与人口', 15, [metric('operatingIndustry', '运营产业证据量表', '/100', positive, 400), metric('districtPopulationGrowth', '板块常住人口同比', '%', growth, 550)]),
    dimension('facilities', '商业交通医疗成熟度', 15, [metric('operatingAmenities', '可达且已运营配套量表', '/100', positive, 120)]),
    dimension('nature', '自然环境与不可复制性', 15, [metric('natureValue', '步行可达自然资产量表', '/100', positive, 180)]),
    dimension('supply', '未来住宅供应风险', 15, [metric('futureSupplyRatio', '5公里新增住宅/现有户数', '%', [[0, 100], [10, 80], [30, 40], [60, 0]], 180)]),
    dimension('liquidity', '二手房流动性', 10, [metric('turnover12m', '12个月成交率', '%', [[0, 0], [1, 30], [3, 70], [5, 90], [8, 100]], 75)]),
    dimension('trend', '板块价格与土地趋势', 5, [metric('corePriceRecovery', '板块多月价格信号', '/100', positive), metric('landRecovery', '土地市场恢复信号', '/100', positive, 120)]),
    dimension('planning', '规划兑现', 5, [metric('planningDelivery', '按建设状态折扣的兑现分', '/100', positive, 180)]),
  ],
  asset: [
    dimension('commute', '目标行业就业中心通勤', 20, [metric('commuteMinutes', '就业篮子加权高峰门到门通勤', '分钟', [[15, 100], [30, 90], [45, 70], [60, 45], [90, 0]], 14)]),
    dimension('location', '地段稀缺性', 15, [metric('locationScarcity', '地段稀缺性证据量表', '/100', positive, 400)]),
    dimension('nature', '自然环境', 15, [metric('natureValue', '步行可达与不可复制性', '/100', positive, 180)]),
    dimension('liquidity', '二手流动性', 15, [metric('turnover12m', '12个月成交率', '%', [[0, 0], [1, 30], [3, 70], [5, 90], [8, 100]]), metric('listingMonths', '挂牌库存消化周期', '月', [[0, 100], [6, 85], [12, 50], [24, 0]])]),
    dimension('supply', '未来供应稀缺性', 10, [metric('futureSupplyRatio', '5公里新增住宅/现有户数', '%', [[0, 100], [10, 80], [30, 40], [60, 0]], 180)]),
    dimension('product', '住宅产品力', 10, [metric('productQuality', '官方户型与建筑参数量表', '/100', positive, 550)]),
    dimension('facilities', '商业交通医疗', 5, [metric('operatingAmenities', '已运营且可达配套量表', '/100', positive, 120)]),
    dimension('property', '小区与物业品质', 5, [metric('propertyQuality', '物业与维护证据量表', '/100', positive, 400)]),
    dimension('age', '楼龄', 5, [metric('buildingAge', '实际竣工楼龄', '年', [[0, 100], [5, 90], [10, 75], [20, 50], [40, 10]], 550)]),
  ],
};

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));
const round = (n: number) => Math.round(n * 10) / 10;
export function interpolate(value: number, anchors: readonly (readonly [number, number])[]) {
  if (!Number.isFinite(value)) throw new Error('Non-finite metric value');
  if (value <= anchors[0][0]) return anchors[0][1];
  for (let i = 1; i < anchors.length; i++) { const [x, y] = anchors[i]; const [px, py] = anchors[i - 1]; if (value <= x) return clamp(py + (y - py) * (value - px) / (x - px)); }
  return anchors.at(-1)![1];
}
export interface MetricResult { id: string; label: string; weight: number; score: number | null; confidence: number; value?: number; unit: string; reason: string; sources: EvidenceSource[]; period?: string; rule: string; }
export interface DimensionResult { id: string; label: string; weight: number; score: number | null; confidence: number; coverage: number; contribution: number; metrics: MetricResult[]; }
export interface ScoreResult { score: number | null; confidence: number; coverage: number; status: 'partial' | 'sufficient' | 'unavailable'; dimensions: DimensionResult[]; plus: string[]; minus: string[]; excluded: string[]; version: string; }

function evidenceQuality(o: Observation, def: MetricDefinition, asOf: string): { confidence: number; reason: string } {
  if (!o.verified || !Number.isFinite(o.value) || !o.basis || !o.sources.length) return { confidence: 0, reason: '没有已核验的完整来源证据' };
  if (def.id === 'commuteMinutes' && o.method !== 'door-to-door-peak') return { confidence: 0, reason: '非高峰门到门测量，不用普通路线或直线距离替代' };
  if (o.sources.some((s) => s.kind === 'unsupported' || !/^https:\/\//.test(s.url))) return { confidence: 0, reason: '来源不符合准入规则' };
  const reference = new Date(asOf).getTime();
  const collected = o.sources.map((s) => new Date(s.collectedAt).getTime());
  const published = o.sources.map((s) => new Date(s.publishedAt).getTime());
  const periodEnd = o.frequency === 'annual' ? `${o.period.slice(0, 4)}-12-31` : o.frequency === 'monthly' ? `${o.period.slice(0, 7)}-28` : o.period;
  const date = new Date(periodEnd).getTime();
  if (![reference, date, ...collected, ...published].every(Number.isFinite) || date > reference || collected.some((d) => d > reference + 86400000) || published.some((d) => d > reference + 86400000)) return { confidence: 0, reason: '日期无效或未来数据' };
  const age = Math.max(0, (reference - date) / 86400000);
  if (age > def.maxAgeDays * 3) return { confidence: 0, reason: '过旧，排除计分但保留原记录' };
  const freshness = age <= def.maxAgeDays ? 1 : Math.max(0.1, 1 - (age - def.maxAgeDays) / (def.maxAgeDays * 2));
  const groups = new Set(o.sources.map((s) => s.independentGroup));
  const independence = groups.size >= 2 ? 1 : 0.9;
  const provenance = o.sources.some((s) => s.kind === 'official') ? 1 : 0.9;
  return { confidence: freshness * independence * provenance * (o.conflict ? 0.35 : 1) * clamp(o.completeness ?? 1, 0, 1), reason: [age > def.maxAgeDays ? '数据偏旧' : '', groups.size === 1 ? '单一独立来源' : '', o.conflict ? '来源冲突，待消歧' : '', o.note ?? ''].filter(Boolean).join('；') || '证据可用' };
}

export function scoreAxis(axis: Axis, observations: Observation[], asOf: string, schoolWeight = 0): ScoreResult {
  const defs = axis === 'asset' && schoolWeight > 0 ? [...MODEL.asset.map((d) => ({ ...d, weight: d.weight * (100 - clamp(schoolWeight, 0, 20)) / 100 })), dimension('school', '学区需求（用户主动开启）', clamp(schoolWeight, 0, 20), [metric('schoolEligibility', '官方当年入学资格证据', '/100', positive, 120)])] : MODEL[axis];
  const dimensions = defs.map((dim): DimensionResult => {
    const totalMetricWeight = dim.metrics.reduce((n, m) => n + m.weight, 0);
    const metrics = dim.metrics.map((def): MetricResult => {
      const candidates = observations.filter((o) => o.metric === def.id).sort((a, b) => b.period.localeCompare(a.period));
      const latest = candidates[0];
      const o = latest && { ...latest, conflict: latest.conflict || candidates.some((c) => c.period === latest.period && c.basis === latest.basis && c.value !== latest.value) };
      const quality = o ? evidenceQuality(o, def, asOf) : { confidence: 0, reason: '尚无权威且同口径数据，未使用替代值' };
      return { id: def.id, label: def.label, weight: def.weight / totalMetricWeight, score: quality.confidence > 0 ? round(interpolate(o.value, def.anchors)) : null, confidence: quality.confidence * 100, value: o?.value, unit: def.unit, reason: quality.reason, sources: o?.sources ?? [], period: o?.period, rule: `${def.ruleNote}；锚点 ${def.anchors.map(([v, s]) => `${v}→${s}`).join(' / ')}` };
    });
    const available = metrics.filter((m) => m.score !== null);
    const coverage = available.reduce((n, m) => n + m.weight, 0);
    return { id: dim.id, label: dim.label, weight: dim.weight, score: coverage ? round(available.reduce((n, m) => n + m.score! * m.weight, 0) / coverage) : null, confidence: round(metrics.reduce((n, m) => n + m.confidence * m.weight, 0)), coverage: coverage * 100, contribution: 0, metrics };
  });
  // Normalize by actual leaf coverage, not by the presence of one metric in a large dimension.
  const usableWeight = dimensions.reduce((n, d) => n + d.weight * d.coverage / 100, 0);
  const targetWeight = dimensions.reduce((n, d) => n + d.weight, 0);
  for (const d of dimensions) d.contribution = usableWeight ? d.weight * d.coverage / 100 / usableWeight * (d.score ?? 0) : 0;
  const score = usableWeight ? round(dimensions.reduce((n, d) => n + d.contribution, 0)) : null;
  const confidence = round(dimensions.reduce((n, d) => n + d.weight * d.confidence, 0) / targetWeight);
  return { score, confidence, coverage: round(usableWeight / targetWeight * 100), status: score === null ? 'unavailable' : confidence >= 70 ? 'sufficient' : 'partial', dimensions,
    plus: dimensions.filter((d) => d.score !== null && d.score >= 70).map((d) => `${d.label} ${d.score}，贡献 ${round(d.contribution)} 分`),
    minus: dimensions.filter((d) => d.score !== null && d.score < 50).map((d) => `${d.label} ${d.score}，低于中性锚点`),
    excluded: dimensions.flatMap((d) => d.metrics.filter((m) => m.score === null).map((m) => `${m.label}：${m.reason}`)), version: MODEL_VERSION };
}

export function cityCoefficient(score: number | null): number | null { return score === null ? null : score >= 90 ? 1 : score >= 80 ? 0.97 : score >= 70 ? 0.92 : score >= 60 ? 0.85 : 0.7; }
export function recommendation(score: number) { return score >= 90 ? '极优机会' : score >= 85 ? '强烈关注' : score >= 80 ? '值得购买' : score >= 75 ? '可以考虑' : score >= 70 ? '一般' : score >= 60 ? '继续等待' : '回避'; }
export function combineScores(timing: ScoreResult, asset: ScoreResult, city: ScoreResult, useCase: UseCase = 'balanced') {
  const weights = USE_CASES[useCase]; const coefficient = cityCoefficient(city.score);
  const presentWeight = (timing.score !== null ? weights.timing : 0) + (asset.score !== null ? weights.asset : 0);
  const baseScore = presentWeight ? round(((timing.score ?? 0) * weights.timing + (asset.score ?? 0) * weights.asset) / presentWeight) : null;
  const full = timing.score !== null && asset.score !== null && coefficient !== null;
  const score = full ? round((timing.score! * weights.timing + asset.score! * weights.asset) * coefficient!) : null;
  const confidence = round((weights.timing * timing.confidence + weights.asset * asset.confidence) * city.confidence / 100);
  const enough = full && confidence >= 70 && Math.min(timing.confidence, asset.confidence, city.confidence) >= 60;
  const warning = city.score !== null && city.score < 60 ? '低价格可能来自长期基本面恶化，不应仅因跌幅进行抄底。' : undefined;
  return { score, baseScore, coefficient, confidence, full, weights, recommendation: enough && !warning ? recommendation(score!) : warning ? '基本面风险 · 不建议抄底' : '证据有限 · 仅供观察', numericBand: score === null ? null : recommendation(score), warning,
    note: full ? '分数使用可用指标；置信度反映原始目标权重覆盖，不是收益概率。' : '只展示已有分项/部分基础分；缺少完整轴或城市系数时不冒充最终综合分。' };
}

export interface SeriesValue { period: string; value: number; basis: string; }
function serialMonth(period: string) { const match = /^(\d{4})-(\d{2})$/.exec(period); return match && Number(match[2]) >= 1 && Number(match[2]) <= 12 ? Number(match[1]) * 12 + Number(match[2]) - 1 : NaN; }
function average(values: number[]) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null; }
export function trendStats(input: SeriesValue[]) {
  const valid = input.filter((p) => Number.isFinite(p.value) && Number.isFinite(serialMonth(p.period))).sort((a, b) => a.period.localeCompare(b.period));
  const last = valid.at(-1); const map = new Map<number, number>();
  if (last) for (const p of valid.filter((p) => p.basis === last.basis)) map.set(serialMonth(p.period), p.value);
  const end = last ? serialMonth(last.period) : NaN;
  const window = (n: number) => { const values = Array.from({ length: n }, (_, i) => map.get(end - n + 1 + i)); return values.every((n): n is number => n !== undefined) ? values : []; };
  const pct = (old: number | undefined) => old === undefined || old === 0 || !last ? null : (last.value / old - 1) * 100;
  const six = window(6); const mean = average(six); const xMean = (six.length - 1) / 2;
  const denominator = six.reduce((n, _, i) => n + (i - xMean) ** 2, 0);
  return { current: last?.value ?? null, period: last?.period ?? null, basis: last?.basis ?? null, mom: pct(map.get(end - 1)), yoy: pct(map.get(end - 12)), ma3: average(window(3)), ma6: mean, ma12: average(window(12)), slope: six.length === 6 && denominator ? six.reduce((n, v, i) => n + (i - xMean) * (v - mean!), 0) / denominator : null, count: map.size };
}
export function priceRecoveryScore(values: SeriesValue[]) {
  const stats = trendStats(values); if (stats.ma3 === null || stats.ma6 === null || stats.slope === null) return null;
  // Large falls are never rewarded. Strong positive momentum eventually reduces value through overheating.
  const level = interpolate(stats.ma3, [[97, 0], [99, 20], [99.7, 50], [100, 80], [100.3, 90], [101, 55], [103, 10]]);
  return round(clamp(level + clamp((stats.ma3 - stats.ma6) * 20, -10, 10)));
}
export const CYCLE_LABELS = ['高位过热', '量价齐跌', '深度去库存', '底部磨底', '成交率先恢复', '房价企稳', '底部右侧', '上升周期', '再次过热'] as const;
export interface CycleSignals { priceMa3: number | null; priceMa6: number | null; volumeMa3: number | null; volumeMa6: number | null; volumeMa12: number | null; inventorySlope: number | null; bargainSlope: number | null; landRecovery: boolean | null; coreStable: boolean | null; confidence: number; }
export interface CycleState { state: number | null; candidate: number | null; confirmations: number; period: string; seenRecovery: boolean; confidence: number; reason: string; }
export function cycleStep(signals: CycleSignals, period: string, previous?: CycleState): CycleState {
  if (previous && period <= previous.period) return previous; // At most one confirmation per distinct month.
  const s = signals;
  let candidate: number | null = null;
  if (s.priceMa3 !== null && s.priceMa6 !== null && s.volumeMa3 !== null && s.volumeMa6 !== null && s.volumeMa12 !== null && s.volumeMa12 > 0 && s.confidence >= 40) {
    const recovering = s.volumeMa3 > s.volumeMa6 && s.volumeMa3 > s.volumeMa12 * 1.05;
    const falling = s.volumeMa3 < s.volumeMa6 && s.volumeMa3 < s.volumeMa12 * 0.95;
    const stable = s.priceMa3 >= 99.9 && s.priceMa3 <= 100.2 && s.priceMa3 >= s.priceMa6;
    const inventoryDown = s.inventorySlope !== null && s.inventorySlope < 0;
    const improving = s.priceMa3 > s.priceMa6;
    if (s.priceMa3 > 100.8 && s.volumeMa3 / s.volumeMa12 > 1.3) candidate = previous?.seenRecovery ? 9 : 1;
    else if (s.priceMa3 > 100.2 && recovering && inventoryDown) candidate = 8;
    else if (stable && recovering && inventoryDown && s.bargainSlope !== null && s.bargainSlope < 0 && s.landRecovery === true && s.coreStable === true) candidate = 7;
    else if (stable && recovering) candidate = 6;
    else if (recovering && s.priceMa3 < 100) candidate = 5;
    else if (s.priceMa3 < 99.7 && falling) candidate = inventoryDown ? 3 : 2;
    else if (improving && s.priceMa3 >= 99.7 && s.priceMa3 <= 100.1 && !falling) candidate = 4;
  }
  const consecutive = previous && serialMonth(period) === serialMonth(previous.period) + 1;
  const confirmations = candidate === null ? 0 : consecutive && candidate === previous?.candidate ? previous.confirmations + 1 : 1;
  const state = confirmations >= 2 ? candidate : consecutive ? previous?.state ?? null : null;
  return { state, candidate, confirmations, period, seenRecovery: !!previous?.seenRecovery || (state !== null && state >= 5 && state <= 8), confidence: candidate === null ? 0 : s.confidence, reason: candidate === null ? '缺少同口径多月价格/成交证据，或信号不匹配；不强行判定周期' : confirmations < 2 ? '候选阶段需连续两个不同月份确认' : '多指标连续确认；5→6→7为优先研究窗口，不是收益保证' };
}

export interface CommuteLeg { destination: string; weight: number; doorToDoorMinutes: number | null; mode: 'transit' | 'drive'; peak: boolean; verified: boolean; transfers: number | null; }
export function commuteBasket(legs: CommuteLeg[]) {
  const configured = legs.filter((l) => Number.isFinite(l.weight) && l.weight > 0);
  const total = configured.reduce((n, l) => n + l.weight, 0);
  const valid = configured.filter((l) => l.verified && l.peak && l.doorToDoorMinutes !== null && Number.isFinite(l.doorToDoorMinutes) && l.doorToDoorMinutes > 0);
  const available = valid.reduce((n, l) => n + l.weight, 0);
  return { minutes: available ? round(valid.reduce((n, l) => n + l.doorToDoorMinutes! * l.weight, 0) / available) : null, coverage: total ? round(available / total * 100) : 0, worstMinutes: valid.length ? Math.max(...valid.map((l) => l.doorToDoorMinutes!)) : null, missing: configured.filter((l) => !valid.includes(l)).map((l) => l.destination) };
}
export function liquidityStats(sales: SeriesValue[], households: number | null, listings: number | null) {
  const stats = trendStats(sales); const monthly = stats.ma12;
  return { turnover12m: monthly !== null && households !== null && households > 0 ? monthly * 12 / households * 100 : null, listingMonths: monthly !== null && monthly > 0 && listings !== null && listings >= 0 ? listings / monthly : null, zeroSales: monthly === 0, warning: monthly === 0 ? '连续12个月无成交，流动性风险' : null };
}
export function inventoryMonths(stock: number | null, sales: SeriesValue[], window: 6 | 12 = 6) { const stats = trendStats(sales); const mean = window === 6 ? stats.ma6 : stats.ma12; return stock !== null && stock >= 0 && mean !== null && mean > 0 ? stock / mean : null; }
export function bargainingRate(listPrice: number, soldPrice: number) { return Number.isFinite(listPrice) && Number.isFinite(soldPrice) && listPrice > 0 && soldPrice > 0 ? (listPrice - soldPrice) / listPrice * 100 : null; }
export function planningValue(rawBenefit: number, status: PlanningStatus) { return clamp(rawBenefit) * PLANNING_DISCOUNTS[status]; }
export interface SupplyRecord { parcelId: string; distanceMeters: number; units: number | null; status: PlanningStatus; sourceUrl: string; updatedAt: string; }
export function supplyWithin(records: SupplyRecord[], radius: 3000 | 5000, surveyComplete: boolean) {
  const unique = new Map<string, SupplyRecord>();
  for (const r of [...records].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))) if (r.distanceMeters >= 0 && r.distanceMeters <= radius && r.sourceUrl.startsWith('https://')) unique.set(r.parcelId, r);
  const valid = [...unique.values()].filter((r) => r.units !== null && Number.isFinite(r.units) && r.units >= 0 && r.status !== 'operational');
  return { committedUnits: valid.filter((r) => ['completed', 'construction', 'approved'].includes(r.status)).reduce((n, r) => n + r.units!, 0), potentialUnits: valid.reduce((n, r) => n + r.units!, 0), canInferScarcity: surveyComplete && [...unique.values()].every((r) => r.units !== null), radius, note: '半径仅用于供应空间范围，不用于替代通勤；规划潜在量与确定供应量分开。' };
}
export function natureValue(type: 'communityPark' | 'cityPark' | 'wetland' | 'river' | 'lake' | 'mountain', walkingMeters: number | null, protectedEvidence: boolean) {
  if (walkingMeters === null || walkingMeters < 0 || !Number.isFinite(walkingMeters)) return null;
  const scarcity = { communityPark: 35, cityPark: 65, wetland: 95, river: 90, lake: 90, mountain: 90 }[type];
  return round(scarcity * (protectedEvidence ? 1 : 0.7) * interpolate(walkingMeters, [[0, 100], [500, 100], [1500, 70], [3000, 30], [5000, 0]]) / 100);
}
