#!/usr/bin/env node
// Production: READ ONLY policy inspection. Fixtures: dedicated LOCAL database only.
// Both arms are required in CI under X-16; local hooks run only target-safety tests.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

export const REQUIRES_LIVE_DB = 'Production RLS metadata and isolated local behavior are independently required.';
const LABEL = 'verify-workflow-requests-entity-scoped';
export function isolatedTarget(value) {
  try {
    const u = new URL(value);
    return ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
      && /^\/ih35_(?:verify|test)(?:[_-].*)?$/.test(u.pathname);
  } catch { return false; }
}

async function policies(client) {
  const { rows } = await client.query(`SELECT c.relrowsecurity, c.relforcerowsecurity, a.attnotnull
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='operating_company_id' AND NOT a.attisdropped
    WHERE n.nspname='mdata' AND c.relname='workflow_requests'`);
  assert.equal(rows.length, 1, 'company column must exist');
  assert.ok(rows[0].relrowsecurity && rows[0].relforcerowsecurity && rows[0].attnotnull, 'RLS, FORCE RLS and NOT NULL required');
  const p = (await client.query(`SELECT policyname, qual, with_check FROM pg_policies
    WHERE schemaname='mdata' AND tablename='workflow_requests'`)).rows;
  for (const [name, fields] of [['mdata_wf_select',['qual']], ['mdata_wf_insert',['with_check']], ['mdata_wf_update',['qual','with_check']]]) {
    const policy = p.find(r => r.policyname === name);
    for (const field of fields) assert.match(policy?.[field] ?? '', /user_accessible_company_ids/, `${name}.${field} needs membership`);
  }
}

async function behavior(client) {
  const role = (await client.query(`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname='ih35_app'`)).rows[0];
  assert.ok(role && !role.rolsuper && !role.rolbypassrls, 'application role must enforce RLS');
  const companies = [randomUUID(), randomUUID()], admins = [randomUUID(), randomUUID()];
  const requester = randomUUID(), requests = [randomUUID(), randomUUID()];
  const type = (await client.query(`SELECT e.enumlabel FROM pg_attribute a
    JOIN pg_enum e ON e.enumtypid=a.atttypid WHERE a.attrelid='org.companies'::regclass
    AND a.attname='company_type' ORDER BY e.enumsortorder LIMIT 1`)).rows[0]?.enumlabel;
  assert.ok(type, 'company type must come from schema');
  await client.query("SET LOCAL app.bypass_rls='lucia'");
  // All identities are synthetic and local. No real company/user/driver row is read.
  await client.query(`INSERT INTO identity.users(id,role) VALUES($1,'Driver')`, [requester]);
  for (let i=0; i<2; i++) {
    await client.query(`INSERT INTO org.companies(id,code,legal_name,company_type) VALUES($1,$2,$2,$3)`, [companies[i], `local-rls-${companies[i]}`, type]);
    await client.query(`INSERT INTO identity.users(id,role) VALUES($1,'Administrator')`, [admins[i]]);
    await client.query(`INSERT INTO org.user_company_access(user_id,company_id) VALUES($1,$2)`, [admins[i], companies[i]]);
    // Third-party requester prevents the requested_by shortcut from masking a broken membership policy.
    await client.query(`INSERT INTO mdata.workflow_requests(id,action_code,requested_by,target_resource_type,target_resource_id,operating_company_id)
      VALUES($1,'WF-064-MDATA-001',$2,'driver',$3,$4)`, [requests[i], requester, randomUUID(), companies[i]]);
  }
  async function visible(user) {
    await client.query("SELECT set_config('app.bypass_rls','',true), set_config('app.current_user_id',$1,true)", [user]);
    await client.query('SET LOCAL ROLE ih35_app');
    const rows = (await client.query('SELECT id::text FROM mdata.workflow_requests WHERE id=ANY($1::uuid[]) ORDER BY id', [requests])).rows;
    await client.query('RESET ROLE');
    return rows.map(r => r.id);
  }
  for (let i=0; i<2; i++) assert.deepEqual(await visible(admins[i]), [requests[i]], `admin ${i} must see exactly its own company`);
  // Red-before-green: deliberately restore a permissive SELECT policy in this rollback-only local transaction.
  await client.query('CREATE POLICY codex_rls_mutant ON mdata.workflow_requests FOR SELECT USING (true)');
  assert.equal((await visible(admins[0])).length, 2, 'mutation must expose the cross-company leak');
  console.log(`${LABEL}: isolated behavior PASS 3/3 (two memberships + permissive-policy mutation detected)`);
}

async function main() {
  if (process.argv.includes('--selftest')) {
    for (const u of [undefined,'postgres://reader@production.neon.tech/neondb','postgres://reader@localhost/neondb','postgres://reader@production.neon.tech/ih35_test']) assert.equal(isolatedTarget(u), false);
    for (const u of ['postgres://test@localhost/ih35_verify','postgres://test@127.0.0.1/ih35_test_rls']) assert.equal(isolatedTarget(u), true);
    console.log(`${LABEL}: target safety PASS 6/6`); return;
  }
  const isolated = process.argv.includes('--isolated');
  const url = isolated ? process.env.WORKFLOW_RLS_TEST_DATABASE_URL : process.env.DATABASE_URL;
  assert.ok(url, isolated ? 'WORKFLOW_RLS_TEST_DATABASE_URL required; no production fixture fallback' : 'DATABASE_URL required');
  if (isolated) assert.ok(isolatedTarget(url), 'fixtures forbidden outside local ih35_verify/ih35_test database');
  const local = isolatedTarget(url);
  const client = new Client({connectionString:url, connectionTimeoutMillis:10000});
  await client.connect();
  try {
    if (local) {
      const identity = (await client.query('SELECT current_database() db, host(inet_server_addr()) address')).rows[0];
      assert.match(identity.db, /^ih35_(?:verify|test)(?:[_-].*)?$/);
      assert.ok(['127.0.0.1','::1',null].includes(identity.address), 'server must actually be local');
    }
    await client.query(local ? 'BEGIN' : 'BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout='30s'");
    await policies(client);
    if (local) await behavior(client);
    else {
      assert.equal((await client.query('SHOW transaction_read_only')).rows[0].transaction_read_only, 'on');
      console.log(`${LABEL}: production metadata PASS (READ ONLY; no entity rows read, no fixtures written)`);
    }
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.end();
  }
}
main().catch(e => { console.error(`${LABEL}: FAIL — ${e.message}`); process.exitCode=1; });
