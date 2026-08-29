import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { projects } from '@/db/schema';
import { allProjects } from '@/lib/bootstrap-data';
import type { ProjectSnapshot } from '@/lib/types';

export const runtime = 'edge';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const [row] = await getDb().select().from(projects).where(eq(projects.id, id)).limit(1);
    if (row) return NextResponse.json({ data: JSON.parse(row.detailJson) as ProjectSnapshot, storage: 'd1' });
  } catch (error) { console.warn('D1 project fallback', error); }
  const project = allProjects.find((item) => item.id === id);
  return project ? NextResponse.json({ data: project, storage: 'bootstrap-snapshot' }) : NextResponse.json({ error: 'project_not_found' }, { status: 404 });
}
