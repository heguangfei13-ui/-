'use client';
import {useEffect,useState} from 'react';
import {dashboards} from '@/lib/bootstrap-data';
import type {City,DashboardData} from '@/lib/types';
export function useDashboard(city:City,revision='') {
  const [saved,setSaved]=useState<DashboardData|null>(null),[error,setError]=useState('');
  useEffect(()=>{const c=new AbortController();fetch(`/api/dashboard?city=${city}&range=60`,{signal:c.signal,cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error('数据读取失败');const v=await r.json() as {data:DashboardData};if(!c.signal.aborted&&v.data?.city===city){setSaved(v.data);setError('');}}).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();},[city,revision]);
  return {data:saved?.city===city?saved:dashboards[city],loading:saved?.city!==city,error};
}
