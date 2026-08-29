export const SCORE_WEIGHTS = Object.freeze({ preservation: 0.45, environment: 0.30, commute: 0.25 });
export interface ScoreInput { preservation: number; environment: number; commute: number; riskPenalty?: number }
export function isWithinHardFilter(input: { totalCost: number | null; area: number | null }) {
  return input.totalCost !== null && input.area !== null && input.totalCost >= 5_000_000 && input.totalCost <= 8_000_000 && input.area >= 110 && input.area <= 140;
}
export function calculateProjectScore(input: ScoreInput) {
  const weighted = input.preservation * SCORE_WEIGHTS.preservation + input.environment * SCORE_WEIGHTS.environment + input.commute * SCORE_WEIGHTS.commute;
  return Math.max(0, Math.min(100, Math.round((weighted - (input.riskPenalty ?? 0)) * 10) / 10));
}
export function monthlyPayment(principal: number, annualRate: number, years: number) {
  if (principal <= 0 || years <= 0) return 0;
  const months = years * 12, rate = annualRate / 12 / 100;
  if (rate === 0) return principal / months;
  return principal * rate * Math.pow(1 + rate, months) / (Math.pow(1 + rate, months) - 1);
}
