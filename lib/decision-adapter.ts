import type { DashboardData, ProjectSnapshot } from './types';
import { combineScores, commuteBasket, cycleStep, MODEL_VERSION, priceRecoveryScore, scoreAxis, trendStats, type Entity, type Observation, type SeriesValue, type UseCase, type CycleSignals, type CycleState } from './decision-model';

export interface EmploymentCenter { id: string; name: string; weight: number; }
export const DEFAULT_BASKETS: Record<string, EmploymentCenter[]> = {
  hangzhou: [{ id: 'future', name: '未来科技城', weight: 35 }, { id: 'xixi', name: '西溪', weight: 20 }, { id: 'binjiang', name: '滨江', weight: 30 }, { id: 'qianjiang', name: '钱江新城', weight: 10 }, { id: 'other', name: '其他（需指定地址）', weight: 5 }],
  nanjing: [{ id: 'hexi', name: '河西', weight: 40 }, { id: 'software', name: '软件谷', weight: 40 }, { id: 'xinjiekou', name: '新街口', weight: 20 }],
};

export function evidenceFromDashboard(data: DashboardData): Observation[] {
  const observations = [...(data.decisionEvidence ?? [])];
  const source = data.sources.find((s) => s.id === 'lpr');
  const rate = data.metrics.find((m) => m.label === '5 年期以上 LPR');
  if (source && source.quality === 'verified' && rate?.quality === 'verified' && /^\d+(\.\d+)?%$/.test(rate.value)) observations.push({ metric: 'lpr5y', value: Number.parseFloat(rate.value), period: source.publishedAt.slice(0, 7), frequency: 'monthly', basis: source.basisVersion, verified: true, method: 'official-statistic', sources: [{ publisher: source.name, url: source.url, publishedAt: source.publishedAt, collectedAt: source.collectedAt, kind: 'official', independentGroup: 'PBOC' }], note: '中国宏观信贷信号；不代表本城成交已经恢复' });
  const points = data.series.filter((p) => p.quality === 'verified' && p.sourceUrl && p.resaleIndex !== null);
  const prices: SeriesValue[] = points.map((p) => ({ period: p.period, value: p.resaleIndex!, basis: p.basisVersion }));
  const priceSignal = priceRecoveryScore(prices); const last = points.at(-1);
  if (priceSignal !== null && last) observations.push({ metric: 'resalePriceRecovery', value: priceSignal, period: last.period, frequency: 'monthly', basis: last.basisVersion, verified: true, completeness: Math.min(1, prices.length / 12), sources: [{ publisher: '国家统计局', url: last.sourceUrl!, collectedAt: last.collectedAt!, publishedAt: data.sources.find((s) => s.id === 'nbs-70')?.publishedAt ?? last.collectedAt!, kind: 'official', independentGroup: 'NBS' }], note: '至少6个连续同基期月度观测；跌幅本身不加分' });
  return observations;
}

export function assetObservations(project: ProjectSnapshot, basket: EmploymentCenter[]): Observation[] {
  const observations = (project.assetEvidence ?? []).filter((o) => o.metric !== 'commuteMinutes');
  const legs = (project.doorToDoorCommutes ?? []).map((leg) => ({ ...leg, weight: basket.find((center) => center.name === leg.destination)?.weight ?? 0 }));
  // Keep unmeasured destinations in the denominator. Do not replace with the old AMap route field.
  for (const center of basket) if (!legs.some((l) => l.destination === center.name)) legs.push({ destination: center.name, weight: center.weight, doorToDoorMinutes: null, mode: 'transit', peak: false, verified: false, transfers: null });
  const commute = commuteBasket(legs);
  const provenance = project.assetEvidence?.find((o) => o.metric === 'commuteMinutes');
  if (commute.minutes !== null && provenance) observations.push({ ...provenance, value: commute.minutes, completeness: commute.coverage / 100, method: 'door-to-door-peak' });
  return observations;
}

export function assessDashboard(data: DashboardData, asOf: string, useCase: UseCase = 'balanced', schoolWeight = 0, basket: EmploymentCenter[] = DEFAULT_BASKETS[data.city] ?? []) {
  const observations = evidenceFromDashboard(data);
  const fundamentals = scoreAxis('fundamentals', observations, asOf);
  const timing = scoreAxis('timing', observations, asOf);
  const prices = data.series.filter((p) => p.quality === 'verified' && p.sourceUrl && p.resaleIndex !== null).map((p) => ({ period: p.period, value: p.resaleIndex!, basis: p.basisVersion }));
  const history = data.decisionHistory ?? {};
  const price = trendStats(prices), volume = trendStats(history.resaleTransactions ?? []), inventory = trendStats(history.resaleInventory ?? []), bargaining = trendStats(history.bargaining ?? []);
  const signals: CycleSignals = { priceMa3: price.ma3, priceMa6: price.ma6, volumeMa3: volume.ma3, volumeMa6: volume.ma6, volumeMa12: volume.ma12, inventorySlope: inventory.slope, bargainSlope: bargaining.slope, landRecovery: history.landRecovered ?? null, coreStable: history.coreStable ?? null, confidence: Math.min(timing.confidence, data.cycleEvidenceConfidence ?? 0) };
  // State is replayed from stored, dated observations, never from repeated page visits.
  let historical: CycleState | undefined;
  for (const item of [...(data.cycleHistory ?? [])].sort((a, b) => a.period.localeCompare(b.period))) historical = cycleStep(item.signals, item.period, historical);
  const cycle = cycleStep(signals, price.period ?? asOf.slice(0, 7), historical);
  const projects = data.projects.map((project) => {
    const asset = scoreAxis('asset', assetObservations(project, basket), asOf, schoolWeight);
    return { id: project.id, asset, combined: combineScores(timing, asset, fundamentals, useCase) };
  });
  return { version: MODEL_VERSION, fundamentals, timing, cycle, projects, trends: { price, volume, inventory, bargaining } };
}

export function hierarchy(data: DashboardData): Entity[] {
  const entities: Entity[] = [{ id: 'china', name: '中国宏观', layer: 'macro', observations: evidenceFromDashboard(data).filter((o) => o.metric === 'lpr5y') }, { id: data.city, name: data.cityName, layer: 'city', parentId: 'china', observations: data.decisionEvidence ?? [] }];
  // Never label administrative districts as verified market sectors.
  entities.push(...(data.marketAreas ?? []));
  for (const project of data.projects) entities.push({ id: project.id, name: project.name, layer: 'community', cityId: data.city, parentId: project.marketAreaId ?? `${data.city}:unassigned`, observations: project.assetEvidence ?? [] });
  if (data.projects.some((p) => !p.marketAreaId)) entities.push({ id: `${data.city}:unassigned`, name: '板块归属待核验', layer: 'district', parentId: data.city, observations: [] });
  entities.push(...(data.listings ?? []));
  return entities;
}
