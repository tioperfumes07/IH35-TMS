#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const ownRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const arg=name=>process.argv.find(a=>a.startsWith(name+'='))?.slice(name.length+1);
const root=arg('--root')??ownRoot;
const baselinePath=path.join(ownRoot,'scripts/verify-live-document-predicates-single-source.baseline.json');
const predicatePath='apps/backend/src/accounting/live-document-predicates.sql.ts';
// These are the canonical state writers, not money readers. Their SQL must
// inspect and stamp dead-state markers; consumers must use the predicate module.
const stateWriters=new Set([
 'apps/backend/src/driver-finance/settlement-void-state.service.ts',
 'apps/backend/src/driver-finance/driver-bill-void-state.service.ts',
]);
const moneyLiteral=line=>/\b(?:voided_at|reversed_at)\s+IS\s+(?:NOT\s+)?NULL/i.test(line)||/\bstatus\s*(?:<>|!=|=|NOT\s+IN|IN)\s*\(?\s*'(?:void|voided|cancelled)'/i.test(line);
function files(dir){return fs.existsSync(dir)?fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]):[];}
function inventory(at){
 const rows={};
 for(const f of files(path.join(at,'apps/backend/src'))){
  const rel=path.relative(at,f).split(path.sep).join('/');
  if(!/\.(?:ts|js)$/.test(f)||/(__tests__|\.test\.|\.spec\.)/.test(rel)||rel===predicatePath||stateWriters.has(rel))continue;
  if(!/\/cash-flow\/|\/driver-finance\/|\/reports\/|\/accounting\/load-cost/.test(rel))continue;
  for(const line of fs.readFileSync(f,'utf8').split('\n')){
   const normalized=line.trim();
   if(normalized.startsWith('//')||normalized.startsWith('*')||!moneyLiteral(normalized))continue;
   // Conservative debt inventory: includes existing historical/read-write SQL. New inline
   // definitions require a named shared predicate, not an expanding exception allowlist.
   const key=rel+':'+crypto.createHash('sha256').update(normalized).digest('hex').slice(0,20);
   rows[key]=(rows[key]??0)+1;
  }
 }
 return rows;
}
function growth(now,base){return Object.entries(now).filter(([key,n])=>n>(base[key]??0));}
function contracts(at,overrides={}){
 const errors=[];
 const read=p=>Object.hasOwn(overrides,p)?overrides[p]:fs.existsSync(path.join(at,p))?fs.readFileSync(path.join(at,p),'utf8'):'';
 const predicates=read(predicatePath);
 for(const name of ['liveSettlement','liveDriverBill','liveExpense','liveBill','openDriverBill'])if(!predicates.includes(`export function ${name}(`))errors.push(`missing shared ${name}`);
 const cash=read('apps/backend/src/cash-flow/cash-flow.service.ts');
 for(const name of ['liveSettlement','openDriverBill','loadCostsRevenueJoin','canonicalHappenedNotVoidedLoadClause'])if(!cash.includes('${'+name+'('))errors.push(`cash flow does not execute ${name}`);
 if(cash.includes('canonicalLoadCostsOpenClause'))errors.push('driver settlement closure must not hide unpaid customer receipts');
 // The legacy response property rate_total_cents is not a SQL source. Inspect
 // SQL templates, not TypeScript mapping of the canonical query's result.
 const cashSql=(cash.match(/`[^`]*`/gs)??[]).join('\n');
 if(cash.includes('ACTIVE_LOAD_FILTER')||cashSql.includes('l.rate_total_cents'))errors.push('private cash-flow load/revenue definition');
 const kpi=read('apps/backend/src/driver-finance/driver-bills.routes.ts');
 if((kpi.match(/\$\{openDriverBill\("db"\)\}/g)??[]).length<2)errors.push('KPI count and rows must share openDriverBill');
 for(const p of ['driver-finance/void-document-callees.service.ts','driver-finance/settlements-bulk.routes.ts','governance/void-cancel-executors.ts']){
  const source=read('apps/backend/src/'+p);
  if(!source.includes('await stampSettlementVoidedInClientTx('))errors.push(`${p}: missing canonical stamp call`);
 }
 return errors;
}
if(process.argv.includes('--selftest')){
 assert.equal(moneyLiteral('AND s.reversed_at IS NULL'),true);
 assert.equal(moneyLiteral("AND s.status NOT IN ('void','voided')"),true);
 assert.equal(moneyLiteral('${liveSettlement("s")}'),false);
 assert.equal(growth({x:1},{x:1}).length,0);
 assert.equal(growth({x:2},{x:1}).length,1);
 assert.equal(growth({y:1},{x:1}).length,1);
 assert.equal(growth({},{x:1}).length,0);
 assert.ok(contracts('/nonexistent-443213-selftest').length>=10);
 const predicates=fs.readFileSync(path.join(ownRoot,predicatePath),'utf8');
 for(const name of ['liveSettlement','liveDriverBill','liveExpense','liveBill','openDriverBill']){
  assert.ok(contracts(ownRoot,{[predicatePath]:predicates.replace(`export function ${name}(`,`function removed_${name}(`)}).includes(`missing shared ${name}`));
 }
 const cashPath='apps/backend/src/cash-flow/cash-flow.service.ts';
 const cash=fs.readFileSync(path.join(ownRoot,cashPath),'utf8');
 for(const name of ['liveSettlement','openDriverBill','loadCostsRevenueJoin','canonicalHappenedNotVoidedLoadClause']){
  assert.ok(contracts(ownRoot,{[cashPath]:cash.replaceAll('${'+name+'(', '${removed_'+name+'(')}).includes(`cash flow does not execute ${name}`));
 }
 assert.ok(contracts(ownRoot,{[cashPath]:cash+'\n// canonicalLoadCostsOpenClause'}).includes('driver settlement closure must not hide unpaid customer receipts'));
 console.log('verify-live-document-predicates-single-source SELFTEST PASS 18/18');
}else if(arg('--seed-from')){
 if(fs.existsSync(baselinePath))throw Error('initial baseline already exists; may only shrink');
 const source=arg('--seed-from'),entries=inventory(source);
 fs.writeFileSync(baselinePath,JSON.stringify({authority:'Lead ROUND 443.213 2026-10-21 23:20Z',measured_at:new Date().toISOString(),source,entries},null,2)+'\n');
 console.log(`Seeded ${Object.values(entries).reduce((a,b)=>a+b,0)} existing inline literals; not proof that each is a live reader`);
}else{
 const base=JSON.parse(fs.readFileSync(baselinePath,'utf8')),now=inventory(root);
 const errors=contracts(root);
 for(const [key,n] of growth(now,base.entries))errors.push(`new inline debt ${key} (${n})`);
 if(process.argv.includes('--shrink')){
  if(growth(now,base.entries).length)throw Error('cannot grow baseline');
  base.entries=now;delete base.source;
  fs.writeFileSync(baselinePath,JSON.stringify(base,null,2)+'\n');
 }
 console.log(`verify-live-document-predicates-single-source: ${errors.length?'FAIL':'PASS'}; inline debt=${Object.values(now).reduce((a,b)=>a+b,0)}; failures=${errors.length}`);
 for(const e of errors)console.error(e);
 if(errors.length)process.exitCode=1;
}
