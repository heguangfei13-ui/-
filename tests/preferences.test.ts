import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_PREFERENCES,validatePreferences,budgetMatch,cashflow} from '../lib/preferences';
import {dashboards} from '../lib/bootstrap-data';
import {assessDashboard,hierarchy} from '../lib/decision-adapter';
test('settings reject invalid ranges, private extra fields and invalid basket totals',()=>{
  assert.throws(()=>validatePreferences({...DEFAULT_PREFERENCES,budgetMin:900}));
  assert.throws(()=>validatePreferences({...DEFAULT_PREFERENCES,cash:Infinity}));
  assert.throws(()=>validatePreferences({...DEFAULT_PREFERENCES,baskets:{...DEFAULT_PREFERENCES.baskets,hangzhou:[]}}));
  assert.equal('token' in validatePreferences({...DEFAULT_PREFERENCES,token:'do-not-store'}),false);
});
test('cashflow shares budget, reserves, loan and LPR spread with settings',()=>{
  const a=cashflow(DEFAULT_PREFERENCES,3.5);assert.equal(a.houseBudget,700);assert.equal(a.rate,3.5);
  const b=cashflow({...DEFAULT_PREFERENCES,cash:500,rateSpread:50},3.5);assert.equal(b.houseBudget,600);assert.equal(b.rate,4);assert.ok(b.payment>a.payment);
  assert.equal(cashflow({...DEFAULT_PREFERENCES,loan:0},3.5).payment,0);
});
test('missing pricing does not remove project asset score; known budget failures are not relaxed',()=>{
  const p=dashboards.nanjing.projects[0];assert.equal(budgetMatch({...p,totalCostRange:[900,1000]},DEFAULT_PREFERENCES).status,'excluded');
  assert.equal(budgetMatch({...p,totalCostRange:[null,null]},DEFAULT_PREFERENCES).status,'unknown');
  const rating=assessDashboard(dashboards.nanjing,'2026-08-30T23:00:00+08:00').projects[0];assert.notEqual(rating.asset.score,null);assert.ok(rating.asset.confidence<20);
});
test('actual official areas form a macro-city-area-community tree',()=>{
  const entities=hierarchy(dashboards.nanjing),map=new Map(entities.map(e=>[e.id,e]));
  for(const p of dashboards.nanjing.projects){const c=map.get(p.id)!;assert.equal(map.get(c.parentId!)?.layer,'district');assert.equal(map.get(c.parentId!)?.parentId,'nanjing');}
  assert.equal(map.get('nanjing')?.parentId,'china');
});
test('real partial evidence produces timing scores and independent asset scores',()=>{
  for(const data of Object.values(dashboards)){const scores=assessDashboard(data,'2026-08-30T23:00:00+08:00');assert.notEqual(scores.timing.score,null);assert.ok(scores.projects.some(x=>x.asset.score!==null));}
});
