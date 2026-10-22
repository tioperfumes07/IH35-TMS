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
export function assertReceiptParity(actual,expected){
 const keys=rows=>rows.map(r=>JSON.stringify([r.id??null,r.invoice_id??null,String(r.amount_cents),r.basis,
  r.bucket_date instanceof Date?r.bucket_date.toISOString().slice(0,10):r.bucket_date??null])).sort();
 assert.ok(expected.length>0,'receipt population not visible');
 assert.deepEqual(keys(actual),keys(expected),'cash-flow receipt source differs');
}
if(process.argv.includes('--selftest')){
 const visible={settlement_population:2,bill_population:3};
 assert.doesNotThrow(()=>assertClean({...visible,settlements:0,driver_bills:0}));
 for(const row of [{settlements:24,driver_bills:0},{settlements:0,driver_bills:1},{settlements:-1,driver_bills:0},{},undefined])assert.throws(()=>assertClean({...visible,...row}));
 assert.throws(()=>assertClean({settlement_population:0,bill_population:0,settlements:0,driver_bills:0}));
 assert.throws(()=>assertClean({...visible,bill_population:0,settlements:0,driver_bills:0}));
 assert.equal((sql.match(/operating_company_id=\$1::uuid/g)??[]).length,4);
 assert.equal(sql.includes(company),false);
 const receipt={id:'load',invoice_id:null,amount_cents:'100',basis:'Predicted',bucket_date:'2030-01-01'};
 assert.doesNotThrow(()=>assertReceiptParity([receipt],[receipt]));
 assert.throws(()=>assertReceiptParity([],[receipt]));
 assert.throws(()=>assertReceiptParity([{...receipt,amount_cents:'101'}],[receipt]));
 assert.throws(()=>assertReceiptParity([{...receipt,bucket_date:'2030-01-02'}],[receipt]));
 assert.throws(()=>assertReceiptParity([receipt,receipt],[receipt]));
 assert.throws(()=>assertReceiptParity([],[]));
 console.log(`${label}: SELFTEST PASS 16/16`);
}else{
 const {client,pool}=await requireLiveDbOrExit({label});
 try{
  await client.query('BEGIN READ ONLY');
  await client.query("SELECT set_config('app.bypass_rls','lucia',true),set_config('app.operating_company_id',$1,true)",[company]);
  const row=(await client.query(sql,[company])).rows[0];
  console.log(`${label}: settlements=${row?.settlements}/${row?.settlement_population}, driver_bills=${row?.driver_bills}/${row?.bill_population}`);
  assertClean(row);console.log(`${label}: PASS`);
  const {tsImport}=await import('tsx/esm/api');
  const {cashFlowReceiptsSql}=await tsImport('../apps/backend/src/cash-flow/cash-flow-receipts.sql.ts',import.meta.url);
  const {getDailyPrediction}=await tsImport('../apps/backend/src/cash-flow/cash-flow.service.ts',import.meta.url);
  for(const eta of [false,true]){
   const queries=[];
   await getDailyPrediction({query:async query=>{queries.push(query);return {rows:[]};}},company,'2030-01-01',eta);
   const emitted=queries.find(query=>query.trimStart().startsWith('SELECT * FROM (WITH unbilled_receipts'));
   assert.ok(emitted,'daily consumer does not execute canonical receipts');
   assert.ok(emitted.includes('WHERE bucket_date = $2::date'),'consumer date filter changed; inspect before broadening proof');
   // Measure every source row, including undated obligations, without the UI date restriction.
   const actual=(await client.query(emitted.replace('WHERE bucket_date = $2::date','WHERE TRUE'),[company])).rows;
   const expected=(await client.query(cashFlowReceiptsSql(eta),[company])).rows;
   try{assertReceiptParity(actual,expected);}catch{throw Error('cash-flow receipt parity failed (row details withheld)');}
   console.log(`${label}: receipt_eta=${eta} rows=${expected.length} differences=0 PASS`);
  }
 }catch(error){console.error(`${label}: FAIL — ${error.message}`);process.exitCode=1;}
 finally{await client.query('ROLLBACK');client.release();await pool.end();}
}
