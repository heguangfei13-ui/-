import { assessDashboard } from '../lib/decision-adapter';
import type { DashboardData } from '../lib/types';

const base = process.env.SITE_URL ?? 'https://home-compass-hz-nj.heguangfei13.chatgpt.site';
type Snapshot = { data: DashboardData; storage: string };
let saved: Snapshot[] | undefined;
if (process.argv.includes('--stdin')) {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  saved = JSON.parse(input) as Snapshot[];
}
for (const city of ['hangzhou', 'nanjing']) {
  let payload = saved?.find((p) => p.data.city === city);
  if (!payload) {
    const response = await fetch(`${base}/api/dashboard?city=${city}&range=60`, { headers: { 'User-Agent': 'HomeCompass/1.0 (model verification)', Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Dashboard read failed: ${response.status}`);
    payload = await response.json() as Snapshot;
  }
  if (payload.storage !== 'd1' || payload.data.city !== city) throw new Error('Not a persisted city snapshot');
  const model = assessDashboard(payload.data, new Date().toISOString());
  console.log(JSON.stringify({ city, source: payload.storage, evidence: payload.data.decisionEvidence?.map((o) => ({ metric: o.metric, value: o.value, period: o.period })) ?? [], timing: { score: model.timing.score, confidence: model.timing.confidence }, fundamentals: { score: model.fundamentals.score, confidence: model.fundamentals.confidence }, cycle: model.cycle.state, assets: model.projects.map((p) => ({ id: p.id, score: p.asset.score, confidence: p.asset.confidence, recommendation: p.combined.recommendation })) }));
}
