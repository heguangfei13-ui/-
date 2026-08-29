import { and, eq, gte, lte } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { projects } from '@/db/schema';
import { allProjects, isCity } from '@/lib/bootstrap-data';
import type { ProjectSnapshot } from '@/lib/types';

export const runtime = 'edge';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const city = isCity(params.get('city')) ? params.get('city')! : 'hangzhou';
  const minTotal = Number(params.get('min_total') ?? 5_000_000), maxTotal = Number(params.get('max_total') ?? 8_000_000);
  try {
    const rows = await getDb().select().from(projects).where(and(eq(projects.city, city), gte(projects.estimatedTotalMin, minTotal), lte(projects.estimatedTotalMax, maxTotal))).limit(50);
    if (rows.length) return NextResponse.json({ data: rows.map((row) => JSON.parse(row.detailJson) as ProjectSnapshot), storage: 'd1' });
  } catch (error) { console.warn('D1 projects fallback', error); }
  return NextResponse.json({ data: allProjects.filter((project) => project.city === city), storage: 'bootstrap-snapshot' });
}
