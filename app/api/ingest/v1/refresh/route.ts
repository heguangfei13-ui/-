import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { and, eq, lte } from 'drizzle-orm';
import { getDb } from '@/db';
import { refreshRequests } from '@/db/schema';
export const runtime='edge';
function authorized(r:Request){return env.INGEST_TOKEN && r.headers.get('authorization')===`Bearer ${env.INGEST_TOKEN}`;}
export async function GET(r:Request){if(!authorized(r))return NextResponse.json({error:'unauthorized'},{status:401});return NextResponse.json({requests:await getDb().select().from(refreshRequests).where(eq(refreshRequests.status,'pending'))},{headers:{'Cache-Control':'no-store'}});}
export async function POST(r:Request){
  if(!authorized(r))return NextResponse.json({error:'unauthorized'},{status:401});
  const body=await r.json() as {through?:string;status?:string;note?:string};
  if(!body.through || !Number.isFinite(Date.parse(body.through)) || !['completed','partial'].includes(body.status??''))return NextResponse.json({error:'invalid payload'},{status:422});
  await getDb().update(refreshRequests).set({completedAt:new Date().toISOString(),status:body.status!,note:(body.note??'').slice(0,300)}).where(and(eq(refreshRequests.status,'pending'),lte(refreshRequests.requestedAt,body.through)));
  return NextResponse.json({ok:true});
}
