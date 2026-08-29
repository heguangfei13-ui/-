import { desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { dashboardSnapshots } from '@/db/schema';
import { dashboards, isCity } from '@/lib/bootstrap-data';
import type { DashboardData } from '@/lib/types';

export const runtime = 'edge';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cityParam = searchParams.get('city');
  const city = isCity(cityParam) ? cityParam : 'hangzhou';
  try {
    const [row] = await getDb().select().from(dashboardSnapshots).where(eq(dashboardSnapshots.city, city)).orderBy(desc(dashboardSnapshots.observedAt)).limit(1);
    if (row) return NextResponse.json({ data: JSON.parse(row.payloadJson) as DashboardData, storage: 'd1', range: searchParams.get('range') ?? '12' });
  } catch (error) {
    console.warn('D1 dashboard fallback', error);
  }
  return NextResponse.json({ data: dashboards[city], storage: 'bootstrap-snapshot', range: searchParams.get('range') ?? '12' });
}
