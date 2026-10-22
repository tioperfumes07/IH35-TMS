import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { assertNotProduction } from './assert-not-production.mjs';
import {prepareFreshDbWexIssuer,WEX_MIGRATION} from './fresh-db-wex-prerequisite.mjs';
test('fresh WEX binds only untouched seed; retry preserves issuer; inactive/assigned refuse repair',async()=>{
 const url=new URL(process.env.WEX_TEST_DATABASE_URL);
 assert.ok(['127.0.0.1','localhost'].includes(url.hostname));assert.match(url.pathname,/_wex_test$/);
 const c=new pg.Client({connectionString:url.href});await c.connect();
 try {
  await assertNotProduction(c,{isolatedLocalTestDatabase:url.pathname.slice(1)});
  await c.query(`CREATE SCHEMA org;CREATE SCHEMA catalogs;CREATE SCHEMA mdata;
   CREATE TABLE org.companies(id uuid,code text,deactivated_at timestamptz);
   INSERT INTO org.companies VALUES('00000000-0000-0000-0000-000000000002','USMCA',NULL);
   CREATE TABLE mdata.vendors(id uuid DEFAULT gen_random_uuid(),operating_company_id uuid,vendor_name text,vendor_type text,vendor_category text,source_system text,is_sample_data bool);
   CREATE TABLE catalogs.fuel_card_types(id uuid DEFAULT gen_random_uuid(),operating_company_id uuid,code text,display_name text,is_active bool,issuer_vendor_id uuid);
   INSERT INTO catalogs.fuel_card_types(operating_company_id,code,display_name,is_active) SELECT id,'WEX','WEX card',true FROM org.companies;`);
  const options={file:WEX_MIGRATION,hostname:url.hostname};
  await prepareFreshDbWexIssuer(c,options);
  const first=(await c.query('SELECT issuer_vendor_id FROM catalogs.fuel_card_types')).rows[0].issuer_vendor_id;
  assert.ok(first);await prepareFreshDbWexIssuer(c,options);
  assert.equal((await c.query('SELECT count(*)::int n FROM mdata.vendors')).rows[0].n,1);
  await c.query('UPDATE catalogs.fuel_card_types SET is_active=false,issuer_vendor_id=NULL');
  await prepareFreshDbWexIssuer(c,options);
  assert.equal((await c.query('SELECT issuer_vendor_id FROM catalogs.fuel_card_types')).rows[0].issuer_vendor_id,null);
  await c.query("UPDATE catalogs.fuel_card_types SET is_active=true,issuer_vendor_id='00000000-0000-0000-0000-000000000003'");
  await prepareFreshDbWexIssuer(c,options);
  assert.equal((await c.query('SELECT issuer_vendor_id FROM catalogs.fuel_card_types')).rows[0].issuer_vendor_id,'00000000-0000-0000-0000-000000000003');
 }finally{await c.end();}
});
