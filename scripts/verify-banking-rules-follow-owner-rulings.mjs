#!/usr/bin/env node
// RC2 443.341: banking rules must not contradict owner rulings on specific payees.
// Owner 10-11: Dreamline Transit→5000(fuel), Alberto Lozano→6110 dispatch, not 5100.
// LIVE guard: RED on current prod (wrong rule targets), GREEN after data fix.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { requireLiveDbOrExit } from './lib/require-live-db.mjs';

const LABEL = 'verify-banking-rules-follow-owner-rulings';

// --- static check: PATCH endpoint schema must accept then_account_id ---
const routes = fs.readFileSync('apps/backend/src/banking/p7-wave2.routes.ts', 'utf8');
const patchBlock = routes.slice(routes.indexOf('app.patch("/api/v1/banking/rules/'));
assert(
  patchBlock.includes('then_account_id') || patchBlock.includes('then_vendor_id'),
  'PATCH /api/v1/banking/rules must accept then_account_id — RC2 not implemented'
);

// --- live check ---
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
    console.error(LABEL + ` FAIL — ${rows.length} rule(s) contradict owner rulings:\n${list}`);
    console.error('Fix via PATCH /api/v1/banking/rules/<id>:');
    console.error('  dreamline transit → then_account_id=353fbd5b-d39c-4709-ac19-60cae52018f7 (5000 Fuel & Diesel)');
    console.error('                      then_vendor_id=3e72d4a5-e6e7-497a-932e-2d3062502be2 (Dreamline Transit LLC)');
    console.error('  alberto lozano   → then_account_id=6819ee7d-b7d4-4fef-8530-ed95afae23f9 (6110-01-002 Dispatch — Laredo)');
    console.error('                      then_vendor_id=ec94b6b0-cdc4-4f86-843c-ae615d177885 (Alberto Lozano)');
    process.exit(1);
  }

  console.log(LABEL + ' PASS — Dreamline and Alberto rules target correct accounts');
} finally {
  client.release();
  await pool.end();
}
