import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { dashboardSnapshots, ingestionRuns, projects, sourceHealth } from '@/db/schema';
import type { DashboardData, ProjectSnapshot } from '@/lib/types';

export const runtime = 'edge';
type Payload = { schema_version: 1; run_id: string; observed_at: string; checksum: string; dashboards: DashboardData[]; projects: ProjectSnapshot[] };

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, val]) => `${JSON.stringify(key)}:${stable(val)}`).join(',')}}`;
  return JSON.stringify(value);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function validPayload(value: unknown): value is Payload {
  if (!value || typeof value !== 'object') return false;
  const body = value as Partial<Payload>;
  return body.schema_version === 1 && typeof body.run_id === 'string' && body.run_id.length >= 8 && typeof body.observed_at === 'string' && typeof body.checksum === 'string' && Array.isArray(body.dashboards) && Array.isArray(body.projects) && body.dashboards.every((d) => d?.city === 'hangzhou' || d?.city === 'nanjing');
}

export async function POST(request: Request) {
  const expected = env.INGEST_TOKEN;
  if (!expected || request.headers.get('authorization') !== `Bearer ${expected}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  if (!validPayload(body)) return NextResponse.json({ error: 'invalid_payload' }, { status: 422 });
  const expectedChecksum = await sha256(stable({ dashboards: body.dashboards, projects: body.projects }));
  if (expectedChecksum !== body.checksum) return NextResponse.json({ error: 'checksum_mismatch' }, { status: 422 });

  const db = getDb();
  const [existingRun] = await db.select().from(ingestionRuns).where(eq(ingestionRuns.runId, body.run_id)).limit(1);
  if (existingRun) return NextResponse.json({ ok: true, idempotent: true, run_id: body.run_id });
  const now = new Date().toISOString();
  await db.insert(ingestionRuns).values({ runId: body.run_id, schemaVersion: 1, checksum: body.checksum, observedAt: body.observed_at, status: 'processing', createdAt: now });
  try {
    for (const dashboard of body.dashboards) {
      const period = dashboard.observedAt.slice(0, 7);
      const [current] = await db.select().from(dashboardSnapshots).where(eq(dashboardSnapshots.city, dashboard.city)).limit(1);
      if (!current || current.observedAt <= body.observed_at) await db.insert(dashboardSnapshots).values({ city: dashboard.city, period, payloadJson: JSON.stringify(dashboard), checksum: body.checksum, observedAt: body.observed_at, createdAt: now }).onConflictDoUpdate({ target: [dashboardSnapshots.city, dashboardSnapshots.period], set: { payloadJson: JSON.stringify(dashboard), checksum: body.checksum, observedAt: body.observed_at, createdAt: now } });
      for (const source of dashboard.sources) await db.insert(sourceHealth).values({ sourceId: source.id, sourceName: source.name, status: source.quality, lastSuccessAt: source.quality === 'verified' ? body.observed_at : null, lastAttemptAt: body.observed_at, consecutiveFailures: source.quality === 'verified' ? 0 : 1, note: source.note }).onConflictDoUpdate({ target: sourceHealth.sourceId, set: { sourceName: source.name, status: source.quality, lastSuccessAt: source.quality === 'verified' ? body.observed_at : null, lastAttemptAt: body.observed_at, consecutiveFailures: source.quality === 'verified' ? 0 : 1, note: source.note } });
    }
    for (const project of body.projects) {
      const [current] = await db.select().from(projects).where(eq(projects.id, project.id)).limit(1);
      if (current && current.updatedAt > project.source.collectedAt) continue;
      const values = { id: project.id, city: project.city, name: project.name, district: project.district, developer: project.developer, address: project.address, areaMin: project.areaRange[0], areaMax: project.areaRange[1], avgPrice: project.averagePrice, estimatedTotalMin: project.totalCostRange[0], estimatedTotalMax: project.totalCostRange[1], sourceName: project.source.name, sourceUrl: project.source.url, updatedAt: project.source.collectedAt, preservationScore: project.scoreParts?.preservation, environmentScore: project.scoreParts?.environment, commuteScore: project.scoreParts?.commute, riskPenalty: project.scoreParts?.riskPenalty ?? 0, finalScore: project.score, evidenceStatus: project.evidenceStatus, riskFlagsJson: JSON.stringify(project.risks), detailJson: JSON.stringify(project) };
      await db.insert(projects).values(values).onConflictDoUpdate({ target: projects.id, set: values });
    }
    await db.update(ingestionRuns).set({ status: 'success' }).where(eq(ingestionRuns.runId, body.run_id));
    return NextResponse.json({ ok: true, idempotent: false, run_id: body.run_id, dashboards: body.dashboards.length, projects: body.projects.length }, { status: 201 });
  } catch (error) {
    await db.update(ingestionRuns).set({ status: 'failed', error: error instanceof Error ? error.message : 'unknown' }).where(eq(ingestionRuns.runId, body.run_id));
    return NextResponse.json({ error: 'ingest_failed' }, { status: 500 });
  }
}
