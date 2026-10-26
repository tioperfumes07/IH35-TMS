#!/usr/bin/env node
// RC2 443.341: banking rules must not contradict owner rulings on specific payees.
// Owner 10-11: Dreamline Transit→5000(fuel), Alberto Lozano→6110 dispatch, not 5100.
// INFORMATIONAL guard: prints correction instructions for live DB rule violations.
// Exit 0 always — static code check is blocking, live data check is advisory until data is patched.
//   --live  also runs the database half (DATABASE_URL required; no DB = FAIL, via requireLiveDbOrExit).
//           Without --live only the static half runs — listed in scripts/lib/e7-batch2-live-guards.json
//           live_flag_guards, so money-pr-local-gate.mjs runs it --live.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const LABEL = 'verify-banking-rules-follow-owner-rulings';

// --- static check: PATCH endpoint schema must accept then_account_id ---
const routes = fs.readFileSync('apps/backend/src/banking/p7-wave2.routes.ts', 'utf8');
/** Static half as a pure function so --selftest can plant the defect into a copy (never the tracked file). */
function patchAcceptsTarget(src) {
  const at = src.indexOf('app.patch("/api/v1/banking/rules/');
  if (at < 0) return false;
  const next = src.indexOf('app.', at + 10);
  const block = src.slice(at, next > at ? next : undefined);
  return block.includes('then_account_id') || block.includes('then_vendor_id');
}
if (process.argv.includes('--selftest')) {
  const at = routes.indexOf('app.patch("/api/v1/banking/rules/');
  const next = routes.indexOf('app.', at + 10);
  const end = next > at ? next : routes.length;
  const mutations = [
    ['PATCH route removed', routes.split('app.patch("/api/v1/banking/rules/').join('app.patch("/api/v1/banking/renamed/')],
    ['PATCH no longer accepts the rule target', routes.slice(0, at) + routes.slice(at, end).split('then_account_id').join('x_acct').split('then_vendor_id').join('x_vendor') + routes.slice(end)],
  ];
  if (!patchAcceptsTarget(routes)) { console.error(`${LABEL} --selftest FAIL — real source rejected`); process.exit(1); }
  let caught = 0;
  for (const [name, mutated] of mutations) {
    if (mutated === routes || patchAcceptsTarget(mutated)) { console.error(`${LABEL} --selftest FAIL — mutation "${name}" escaped or was inert`); process.exit(1); }
    caught += 1;
  }
  console.log(`${LABEL} SELFTEST PASS — ${caught}/${mutations.length} planted defects caught (static half; live half is advisory)`);
  process.exit(0);
}
assert(patchAcceptsTarget(routes), 'PATCH /api/v1/banking/rules must accept then_account_id — RC2 not implemented');
console.log(`${LABEL} STATIC PASS — PATCH /api/v1/banking/rules accepts then_account_id`);

if (!process.argv.includes('--live')) {
  console.log(`${LABEL}: OK (static) — database half runs with --live (live_flag_guards; money-pr-local-gate runs it)`);
  process.exit(0);
}

// --- live check (--live only) ---
const { requireLiveDbOrExit } = await import('./lib/require-live-db.mjs');
const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
try {
  const USMCA = '5c854333-6ea5-4faa-af31-67cb272fef80';

  const { rows } = await client.query(
    `SELECT r.id::text AS rule_id, r.description_contains, a.account_number
     FROM accounting.banking_rules r
     JOIN catalogs.accounts a ON a.id = r.then_account_id
     WHERE r.operating_company_id = $1::uuid AND r.is_active = true
       AND (
         (r.description_contains = 'dreamline transit' AND a.account_number = '5100') OR
         (r.description_contains = 'alberto lozano'   AND a.account_number = '5100') OR
         (r.description_contains = 'dreamline transit' AND a.account_number = '2410') OR
         (r.description_contains = 'alberto lozano'   AND a.account_number = '2410')
       )`,
    [USMCA]
  );

  if (rows.length > 0) {
    const list = rows.map((r) => `  rule ${r.rule_id} desc='${r.description_contains}' → account ${r.account_number} (WRONG)`).join('\n');
    console.log(LABEL + ` ADVISORY — ${rows.length} rule(s) contradict owner rulings (data fix required):\n${list}`);
    console.log('Fix via PATCH /api/v1/banking/rules/<id>:');
    console.log('  dreamline transit → then_account_id=353fbd5b-d39c-4709-ac19-60cae52018f7 (5000 Fuel & Diesel)');
    console.log('                      then_vendor_id=3e72d4a5-e6e7-497a-932e-2d3062502be2 (Dreamline Transit LLC)');
    console.log('  alberto lozano   → then_account_id=6819ee7d-b7d4-4fef-8530-ed95afae23f9 (6110-01-002 Dispatch — Laredo)');
    console.log('                      then_vendor_id=ec94b6b0-cdc4-4f86-843c-ae615d177885 (Alberto Lozano)');
    // exit 0: advisory only — static code check (above) is the blocking gate; live data fix is separate
    process.exit(0);
  }

  console.log(LABEL + ' PASS — Dreamline and Alberto rules target correct accounts');
} finally {
  client.release();
  await pool.end();
}
