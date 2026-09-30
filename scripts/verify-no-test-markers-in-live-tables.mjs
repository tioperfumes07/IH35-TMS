#!/usr/bin/env node
// R297.5 X-19: current survivor inventory, including cancelled/draft rows.
// No date cutoff: this explicitly audits surviving fixtures, not period economics.
// REQUIRES_LIVE_DB. No baseline, purge, fixture writes or mutation of application files.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { requireLiveDbOrExit } from './lib/require-live-db.mjs';

export const COMPANY = '5c854333-6ea5-4faa-af31-67cb272fef80';
export const TABLES = Object.freeze([
  'maintenance.work_orders', 'maintenance.severe_repair_estimates',
  'maintenance.parts_inventory', 'maintenance.road_service_tickets',
  'catalogs.pm_intervals', 'maintenance.pm_schedules',
]);
const LABEL = 'verify-no-test-markers-in-live-tables';
const fields = /name|code|label|description|part_number|ticket_number|complaint|work_performed|parts_used|notes|reason|invoice_number/i;
const marker = /void\s+after\s+proof|CODEX[- ]LIVE|WAVE3|CC3-TEST|TEST|SAMPLE|DEMO|PRACTICE|EXAMPLE|PROOF/ig;

export function directEvidence(row) {
  return Object.entries(row).flatMap(([field, value]) => {
    if (!fields.test(field) || typeof value !== 'string') return [];
    const matches = [...value.matchAll(marker)].map(match => match[0]);
    return matches.length ? [{ field, value, markers: [...new Set(matches)] }] : [];
  });
}

export function inspectRows(rows) {
  const scoped = rows.filter(x => TABLES.includes(x.table) && x.row.operating_company_id === COMPANY);
  const parents = new Map(scoped.filter(x => x.table === 'maintenance.work_orders').map(x => [x.row.id, x.row]));
  const violations = [];
  for (const { table, row } of scoped) {
    let evidence = directEvidence(row);
    // Four measured estimates have no own marker. Follow the real parent FK,
    // never infer test status from a unit name or another row on the same unit.
    if (!evidence.length && table === 'maintenance.severe_repair_estimates') {
      const parent = parents.get(row.trigger_wo_id);
      if (parent) evidence = directEvidence(parent).map(e => ({
        ...e, field: 'trigger_wo_id->work_orders.' + e.field, parent_id: parent.id,
      }));
    }
    if (evidence.length) violations.push({ table, id: row.id, evidence });
  }
  return violations;
}

export function selftest() {
  let passed = 0;
  const check = fn => { fn(); passed++; };
  const row = (extra = {}) => ({ id: 'offline-only', operating_company_id: COMPANY, ...extra });
  for (const value of ['TEST', 'sample', 'DeMo', 'PRACTICE', 'EXAMPLE', 'PROOF', 'void after proof', 'CODEX-LIVE', 'WAVE3', 'CC3-TEST']) {
    check(() => assert.equal(inspectRows([{ table: TABLES[0], row: row({ description: value }) }]).length, 1, value));
  }
  for (const field of ['name', 'code', 'label', 'description', 'part_number', 'cancel_notes', 'notes', 'ticket_number']) {
    check(() => assert.equal(inspectRows([{ table: TABLES[0], row: row({ [field]: 'mixed-Test-marker' }) }]).length, 1, field));
  }
  check(() => assert.equal(inspectRows([{ table: TABLES[0], row: row({ description: 'Tire replacement' }) }]).length, 0));
  check(() => assert.equal(inspectRows([{ table: TABLES[0], row: row({ operating_company_id: 'another-entity', description: 'TEST' }) }]).length, 0));
  const parent = { table: TABLES[0], row: row({ id: 'parent', cancel_notes: 'test WO', status: 'cancelled' }) };
  const child = { table: TABLES[1], row: row({ id: 'child', trigger_wo_id: 'parent', description: '', estimate_status: 'draft' }) };
  check(() => {
    const result = inspectRows([parent, child]);
    assert.equal(result.length, 2);
    assert.equal(result[1].evidence[0].parent_id, 'parent');
  });
  check(() => assert.equal(inspectRows([child]).length, 0, 'no name/unit inference'));
  check(() => assert.equal(inspectRows([parent, { ...child, row: { ...child.row, operating_company_id: 'other' } }]).length, 1));
  check(() => assert.equal(inspectRows([{ table: TABLES[0], row: row({ description: null }) }]).length, 0));
  check(() => {
    // Mutation proof: suppressing detection MUST fail the same positive contract.
    const contract = detector => assert.equal(detector([parent]).length, 1);
    contract(inspectRows);
    assert.throws(() => contract(() => []), assert.AssertionError);
  });
  console.log(LABEL + ': --selftest PASS ' + passed + '/' + passed + '; suppressed-detector mutation rejected; no database or files written');
}

export async function collectRows(client) {
  const result = [];
  for (const table of TABLES) {
    // Table names come only from the closed constant above; company is bound.
    const { rows } = await client.query(
      'SELECT to_jsonb(t) AS row FROM ' + table + ' t WHERE t.operating_company_id=$1::uuid ORDER BY t.id',
      [COMPANY],
    );
    result.push(...rows.map(x => ({ table, row: x.row })));
  }
  return result;
}

export async function runLive() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query('BEGIN READ ONLY');
    await client.query('SET LOCAL ROLE ih35_ci_readonly');
    await client.query("SET LOCAL app.bypass_rls='lucia'");
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [COMPANY]);
    const { rows: context } = await client.query("SELECT current_user AS role, current_setting('transaction_read_only') AS read_only, now() AS measured_at");
    assert.equal(context[0].role, 'ih35_ci_readonly');
    assert.equal(context[0].read_only, 'on');
    let rows = await collectRows(client);
    if (!rows.length) rows = await collectRows(client); // verify empty result, never silent RLS-zero
    const violations = inspectRows(rows);
    const counts = Object.fromEntries(TABLES.map(table => [table, {
      scanned: rows.filter(x => x.table === table).length,
      flagged: violations.filter(x => x.table === table).length,
    }]));
    console.log(JSON.stringify({ label: LABEL, company: COMPANY, ...context[0], counts, violations }, null, 2));
    console.log(LABEL + ': ' + (violations.length ? 'FAIL' : 'PASS') + ' — ' + violations.length + ' marked rows / ' + rows.length + ' scoped rows scanned');
    return violations.length ? 1 : 0;
  } finally {
    try { await client.query('ROLLBACK'); } finally { client.release(); await pool.end(); }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.includes('--selftest')) selftest();
    else process.exitCode = await runLive();
  } catch (error) {
    console.error(LABEL + ': FAIL — ' + error.message);
    process.exitCode = 1;
  }
}

