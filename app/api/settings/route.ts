import { NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { visitorPreferences, refreshRequests } from '@/db/schema';
import { validatePreferences } from '@/lib/preferences';
import { COOKIE, profileId, readPreferences } from '@/lib/preference-store';
export const runtime='edge';
const headers={'Cache-Control':'private, no-store'};
export async function GET(request:Request) {
  try { return NextResponse.json({preferences:await readPreferences(request),refresh:await getDb().select().from(refreshRequests)},{headers}); }
  catch { return NextResponse.json({error:'设置服务暂不可用，请稍后重试'},{status:503,headers}); }
}
export async function POST(request:Request) {
  if(request.headers.get('origin')!==new URL(request.url).origin) return NextResponse.json({error:'origin rejected'},{status:403});
  const text=await request.text(); if(text.length>12000)return NextResponse.json({error:'payload too large'},{status:413});
  let preferences;
  try { preferences=validatePreferences(JSON.parse(text)); } catch(e) {return NextResponse.json({error:e instanceof Error?e.message:'设置无效'},{status:422});}
  const id=profileId(request)??crypto.randomUUID(),now=new Date().toISOString();
  try {
    const db=getDb();
    const [previous]=await db.select().from(visitorPreferences).where(eq(visitorPreferences.id,id)).limit(1);
    if(previous && Date.now()-Date.parse(previous.updatedAt)<2000)return NextResponse.json({error:'请稍后再保存'},{status:429});
    await db.batch([
      db.insert(visitorPreferences).values({id,payload:JSON.stringify(preferences),updatedAt:now}).onConflictDoUpdate({target:visitorPreferences.id,set:{payload:JSON.stringify(preferences),updatedAt:now}}),
      ...(['hangzhou','nanjing'] as const).map(city=>db.insert(refreshRequests).values({city,requestedAt:now,status:'pending'}).onConflictDoUpdate({target:refreshRequests.city,set:{requestedAt:now,status:'pending',note:sql`NULL`}})),
    ]);
    const response=NextResponse.json({preferences,refresh:'pending',message:'已保存并重新筛选；外部数据刷新已排队，由每小时检查的后台任务处理。'},{headers});
    response.cookies.set(COOKIE,id,{httpOnly:true,sameSite:'strict',secure:new URL(request.url).protocol==='https:',path:'/',maxAge:31536000});
    return response;
  } catch {return NextResponse.json({error:'未保存成功，请重试'},{status:503,headers});}
}
