'use client';
import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import {DEFAULT_PREFERENCES,type Preferences} from '@/lib/preferences';
interface Refresh {city:string;status:string;requestedAt:string;completedAt?:string;note?:string;}
const Context=createContext<{preferences:Preferences;ready:boolean;error:string;refresh:Refresh[];save:(p:Preferences)=>Promise<void>}>({preferences:DEFAULT_PREFERENCES,ready:false,error:'',refresh:[],save:async()=>{}});
export function PreferencesProvider({children}:{children:ReactNode}) {
  const [preferences,setPreferences]=useState(DEFAULT_PREFERENCES),[ready,setReady]=useState(false),[error,setError]=useState(''),[refresh,setRefresh]=useState<Refresh[]>([]);
  useEffect(()=>{let live=true;fetch('/api/settings',{cache:'no-store'}).then(async r=>{const v=await r.json() as {preferences:Preferences;refresh:Refresh[];error?:string};if(!r.ok)throw new Error(v.error);if(live){setPreferences(v.preferences);setRefresh(v.refresh??[]);}}).catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setReady(true);});return()=>{live=false;};},[]);
  async function save(p:Preferences){const r=await fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)}),v=await r.json() as {preferences:Preferences;error?:string};if(!r.ok)throw new Error(v.error);setPreferences(v.preferences);setError('');setRefresh([{city:p.city,status:'pending',requestedAt:new Date().toISOString()}]);}
  return <Context.Provider value={{preferences,ready,error,refresh,save}}>{children}</Context.Provider>;
}
export function usePreferences(){return useContext(Context);}
