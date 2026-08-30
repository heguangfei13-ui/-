'use client';
import Link from 'next/link';
export default function Navigation({active='dashboard'}:{active?:'dashboard'|'settings'|'cashflow'}){
  return <nav className="app-nav" aria-label="主导航"><Link className="app-brand" href="/">宅 <span>置业罗盘</span></Link><div>{[['dashboard','/','市场与选房'],['cashflow','/cashflow','贷款与现金流'],['settings','/settings','设置']] .map(([id,href,label])=><Link key={id} href={href} aria-current={active===id?'page':undefined}>{label}</Link>)}</div></nav>;
}
