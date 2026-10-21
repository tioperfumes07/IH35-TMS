#!/usr/bin/env node
import assert from 'node:assert/strict';
import { requireLiveDbOrExit } from './lib/require-live-db.mjs';
export const REQUIRES_LIVE_DB = 'USMCA live document markers; no empty-database baseline';
const company='5c854333-6ea5-4faa-af31-67cb272fef80';
const label='verify-usmca-live-document-state';
export const sql=`SELECT
 (SELECT count(*)::int FROM driver_finance.driver_settlements WHERE operating_company_id=$1::uuid) AS settlement_population,
 (SELECT count(*)::int FROM driver_finance.driver_bills WHERE operating_company_id=$1::uuid) AS bill_population,
 (SELECT count(*)::int FROM driver_finance.driver_settlements WHERE operating_company_id=$1::uuid
   AND ((status='cancelled') IS DISTINCT FROM (voided_at IS NOT NULL)
     OR (voided_at IS NULL) IS DISTINCT FROM (reversed_at IS NULL))) AS settlements,
 (SELECT count(*)::int FROM driver_finance.driver_bills WHERE operating_company_id=$1::uuid
   AND (status IN ('void','voided')) IS DISTINCT FROM (voided_at IS NOT NULL)) AS driver_bills`;
export function assertClean(row){
 if(!row||!Number.isSafeInteger(row.settlements)||!Number.isSafeInteger(row.driver_bills))throw Error('missing or invalid counts');
 assert.ok(Number.isSafeInteger(row.settlement_population)&&row.settlement_population>0,'USMCA settlement population not visible');
 assert.ok(Number.isSafeInteger(row.bill_population)&&row.bill_population>0,'USMCA driver bill population not visible');
 assert.equal(row.settlements,0,'inconsistent USMCA settlements');
 assert.equal(row.driver_bills,0,'inconsistent USMCA driver bills');
}
if(process.argv.includes('--selftest')){
 const visible={settlement_population:2,bill_population:3};
 assert.doesNotThrow(()=>assertClean({...visible,settlements:0,driver_bills:0}));
 for(const row of [{settlements:24,driver_bills:0},{settlements:0,driver_bills:1},{settlements:-1,driver_bills:0},{},undefined])assert.throws(()=>assertClean({...visible,...row}));
 assert.throws(()=>assertClean({settlement_population:0,bill_population:0,settlements:0,driver_bills:0}));
 assert.throws(()=>assertClean({...visible,bill_population:0,settlements:0,driver_bills:0}));
 assert.equal((sql.match(/operating_company_id=\$1::uuid/g)??[]).length,4);
 assert.equal(sql.includes(company),false);
 console.log(`${label}: SELFTEST PASS 10/10`);
}else{
 const {client,pool}=await requireLiveDbOrExit({label});
 try{
  await client.query('BEGIN READ ONLY');
  await client.query("SELECT set_config('app.bypass_rls','lucia',true),set_config('app.operating_company_id',$1,true)",[company]);
  const row=(await client.query(sql,[company])).rows[0];
  console.log(`${label}: settlements=${row?.settlements}/${row?.settlement_population}, driver_bills=${row?.driver_bills}/${row?.bill_population}`);
  assertClean(row);console.log(`${label}: PASS`);
 }catch(error){console.error(`${label}: FAIL — ${error.message}`);process.exitCode=1;}
 finally{await client.query('ROLLBACK');client.release();await pool.end();}
}
