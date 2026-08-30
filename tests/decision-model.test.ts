import test from 'node:test';
import assert from 'node:assert/strict';
import { MODEL, scoreAxis, cityCoefficient, combineScores, priceRecoveryScore, trendStats, cycleStep, commuteBasket, planningValue, liquidityStats, supplyWithin, natureValue, type Observation, type ScoreResult, type CycleSignals } from '../lib/decision-model';
import { assessDashboard, assetObservations, DEFAULT_BASKETS } from '../lib/decision-adapter';
import { dashboards } from '../lib/bootstrap-data';

const now = '2026-08-30T12:00:00Z';
const observation = (metric: string, value: number, extra: Partial<Observation> = {}): Observation => ({ metric, value, period: '2026-07', frequency: 'monthly', basis: 'fixture-v1', verified: true, sources: [{ publisher: '测试权威源', url: 'https://www.stats.gov.cn/test', publishedAt: '2026-08-17', collectedAt: '2026-08-30', kind: 'official', independentGroup: 'NBS' }], ...extra });
const monthly = (values: number[], start = 0) => values.map((value, i) => { const d = new Date(Date.UTC(2025, start + i, 1)); return { period: d.toISOString().slice(0, 7), value, basis: 'a' }; });
const fullScore = (score: number, confidence = 100): ScoreResult => ({ score, confidence, coverage: 100, status: 'sufficient', dimensions: [], plus: [], minus: [], excluded: [], version: 'fixture' });

test('四套轴权重均100，资产学区默认0，产业40/30/30', () => {
  for (const axis of Object.values(MODEL)) assert.equal(axis.reduce((n, d) => n + d.weight, 0), 100);
  assert.equal(MODEL.asset.some((d) => d.id === 'school'), false);
  assert.deepEqual(MODEL.fundamentals.find((d) => d.id === 'industry')!.metrics.map((m) => m.weight), [40, 30, 30]);
});
test('缺失不当0分：单一可用信贷仍出分，置信度与覆盖率低', () => {
  const result = scoreAxis('timing', [observation('lpr5y', 3.5)], now);
  assert.equal(result.score, 62.5); assert.equal(result.coverage, 10); assert.equal(result.confidence, 9); assert.equal(result.status, 'partial');
});
test('完全无证据不编造中性分', () => { assert.equal(scoreAxis('asset', [], now).score, null); });
test('单一来源、旧值、冲突降低置信度，不改原值', () => {
  const fresh = scoreAxis('timing', [observation('lpr5y', 3.5)], now);
  const old = scoreAxis('timing', [observation('lpr5y', 3.5, { period: '2026-03' })], now);
  const conflict = scoreAxis('timing', [observation('lpr5y', 3.5), observation('lpr5y', 3.6)], now);
  assert.ok(old.confidence < fresh.confidence); assert.ok(conflict.confidence < fresh.confidence);
  assert.equal(old.score, fresh.score);
});
test('未来数据、无来源、非数值与非权威替代值都不参与', () => {
  for (const o of [observation('lpr5y', NaN), observation('lpr5y', 3, { period: '2027-01' }), observation('lpr5y', 3, { sources: [] }), observation('lpr5y', 3, { verified: false })]) assert.equal(scoreAxis('timing', [o], now).score, null);
});
test('城市系数连续边界无空隙', () => { assert.deepEqual([59.9, 60, 69.9, 70, 79.9, 80, 89.9, 90, 100].map(cityCoefficient), [.7, .85, .85, .92, .92, .97, .97, 1, 1]); assert.equal(cityCoefficient(null), null); });
test('按用途使用精确公式；弱城市不能靠高时机抄底', () => {
  const city = fullScore(80), timing = fullScore(90), asset = fullScore(70);
  assert.equal(combineScores(timing, asset, city).score, 75.7);
  assert.equal(combineScores(timing, asset, city, 'home').score, 73.7);
  assert.equal(combineScores(timing, asset, city, 'investment').score, 77.6);
  assert.match(combineScores(fullScore(100), fullScore(100), fullScore(50)).warning!, /不应仅因跌幅/);
});
test('低置信度高分不得显示强购买建议，缺一整轴只给部分分', () => {
  assert.equal(combineScores(fullScore(95, 10), fullScore(95), fullScore(95)).recommendation, '证据有限 · 仅供观察');
  const empty = scoreAxis('asset', [], now), combined = combineScores(fullScore(90), empty, fullScore(90));
  assert.equal(combined.score, null); assert.equal(combined.baseScore, 90);
});
test('多月连续性、12月MA、同比与基期断点', () => {
  const s = monthly(Array.from({ length: 13 }, (_, i) => 100 + i)); const stats = trendStats(s);
  assert.equal(stats.ma3, 111); assert.equal(stats.ma6, 109.5); assert.equal(stats.ma12, 106.5); assert.ok(Math.abs(stats.yoy! - 12) < 1e-8); assert.equal(stats.slope, 1);
  assert.equal(trendStats(s.filter((_, i) => i !== 10)).ma3, null);
  assert.equal(trendStats(s.map((p, i) => ({ ...p, basis: i > 10 ? 'new' : 'old' }))).ma3, null);
});
test('单月不评分，深跌分数低于企稳，而非越跌越值得买', () => {
  assert.equal(priceRecoveryScore(monthly([99])), null);
  assert.ok(priceRecoveryScore(monthly([98, 98, 98, 98, 98, 98]))! < priceRecoveryScore(monthly([99.7, 99.8, 99.9, 100, 100, 100]))!);
});
test('周期两个不同月份确认，重复访问不推进；不足时无法判断', () => {
  const signals: CycleSignals = { priceMa3: 99.8, priceMa6: 99.5, volumeMa3: 120, volumeMa6: 100, volumeMa12: 90, inventorySlope: -1, bargainSlope: -1, landRecovery: true, coreStable: true, confidence: 90 };
  const one = cycleStep(signals, '2026-06'); assert.equal(one.state, null); assert.equal(one.candidate, 5);
  assert.deepEqual(cycleStep(signals, '2026-06', one), one);
  const two = cycleStep(signals, '2026-07', one); assert.equal(two.state, 5);
  const stable = { ...signals, priceMa3: 100, priceMa6: 99.9 };
  assert.equal(cycleStep(stable, '2026-09', cycleStep(stable, '2026-08', two)).state, 7);
  assert.equal(cycleStep({ ...signals, volumeMa12: null }, '2026-06').state, null);
});
test('通勤必须高峰门到门；缺失就业中心留在覆盖率分母', () => {
  const result = commuteBasket([{ destination: 'A', weight: 30, doorToDoorMinutes: 30, mode: 'transit', peak: true, verified: true, transfers: 1 }, { destination: 'B', weight: 70, doorToDoorMinutes: 15, mode: 'drive', peak: false, verified: true, transfers: 0 }]);
  assert.equal(result.minutes, 30); assert.equal(result.coverage, 30);
  assert.equal(scoreAxis('asset', [observation('commuteMinutes', 30, { method: 'route-estimate' })], now).score, null);
});
test('旧地图通勤不能成为新资产评分', () => { assert.deepEqual(assetObservations(dashboards.hangzhou.projects[0], DEFAULT_BASKETS.hangzhou), []); });
test('概念规划不给收益高分，零挂牌/零供应不得误判', () => {
  assert.equal(planningValue(100, 'concept'), 0); assert.equal(planningValue(100, 'construction'), 60);
  const empty = supplyWithin([], 3000, false); assert.equal(empty.canInferScarcity, false);
  assert.equal(liquidityStats(monthly(Array(12).fill(0)), 100, 20).zeroSales, true);
  assert.equal(liquidityStats(monthly(Array(12).fill(0)), 100, 20).listingMonths, null);
});
test('供应去重分半径，公园名称/直线距离不能代替步行证据', () => {
  const rows = [{ parcelId: 'a', distanceMeters: 3500, units: 100, status: 'approved' as const, sourceUrl: 'https://gov.example/a', updatedAt: '2026-07-01' }];
  assert.equal(supplyWithin(rows, 3000, true).committedUnits, 0); assert.equal(supplyWithin([...rows, ...rows], 5000, true).committedUnits, 100);
  assert.equal(natureValue('wetland', null, true), null); assert.ok(natureValue('wetland', 500, true)! > natureValue('communityPark', 500, true)!);
});
test('确定性和新城市复用，学校开关只影响资产轴', () => {
  assert.deepEqual(assessDashboard(dashboards.hangzhou, now), assessDashboard(dashboards.hangzhou, now));
  assert.equal(scoreAxis('asset', [observation('schoolEligibility', 100)], now).score, null);
  assert.equal(scoreAxis('asset', [observation('schoolEligibility', 100)], now, 5).score, 100);
});
