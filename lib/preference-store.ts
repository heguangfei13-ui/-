import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { visitorPreferences } from '@/db/schema';
import { DEFAULT_PREFERENCES, type Preferences } from './preferences';
export const COOKIE='hc_profile';
export function profileId(request: Request) {
  const id=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
  return id && /^[a-f0-9-]{36}$/.test(id) ? id : null;
}
export async function readPreferences(request:Request):Promise<Preferences> {
  const id=profileId(request); if(!id)return structuredClone(DEFAULT_PREFERENCES);
  const [row]=await getDb().select().from(visitorPreferences).where(eq(visitorPreferences.id,id)).limit(1);
  return row?JSON.parse(row.payload):structuredClone(DEFAULT_PREFERENCES);
}
