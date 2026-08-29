import test from 'node:test';
import assert from 'node:assert/strict';
import { SCORE_WEIGHTS, calculateProjectScore, isWithinHardFilter, monthlyPayment } from '../lib/scoring';
test('项目权重总和为 100%，且不含学区维度', () => { assert.equal(Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0), 1); assert.equal('school' in SCORE_WEIGHTS, false); });
test('预算与面积是硬筛条件', () => { assert.equal(isWithinHardFilter({ totalCost: 6_800_000, area: 128 }), true); assert.equal(isWithinHardFilter({ totalCost: 8_100_000, area: 128 }), false); assert.equal(isWithinHardFilter({ totalCost: 6_800_000, area: 105 }), false); assert.equal(isWithinHardFilter({ totalCost: null, area: 128 }), false); });
test('风险扣分生效且评分是确定性的', () => { const input = { preservation: 82, environment: 91, commute: 76, riskPenalty: 8 }; assert.equal(calculateProjectScore(input), calculateProjectScore(input)); assert.equal(calculateProjectScore(input), 75.2); });
test('等额本息计算结果合理', () => { const payment = monthlyPayment(2_000_000, 3.5, 30); assert.ok(payment > 8900 && payment < 9100); });
