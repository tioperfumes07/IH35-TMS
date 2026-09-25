#!/usr/bin/env node
// verify-settlement-net-equals-document.mjs — R-162 GUARD B (Lead order, 2026-09-25). Static/live
// half of the runtime refusal wired into closeSettlementPayRun
// (apps/backend/src/driver-finance/settlement-payrun-close.service.ts). Asserts, over every LIVE
// non-cancelled USMCA driver_finance.driver_settlements row that carries a source_document_ref
// with a matching driver-side entry in the signed AlwaysTrack ground-truth file, that
// net_pay (cents) EXACTLY equals that document's own TOTAL DUE (cents). Zero tolerance, no
// rounding band — mirrors verify-alwaystrack-parity.mjs's own DRIVER_NET dimension, but runs
// per-settlement (naming which document(s) are off) rather than only a fleet-wide sum, and is the
// SAME check closeSettlementPayRun now runs at close time via findGroundTruthDocument
// (apps/backend/src/feed/feed-day-preflight.service.ts) — never a second parse of the signed PDF
// text, never a second GL/money formula.
//
// Self-test: node scripts/verify-settlement-net-equals-document.mjs --selftest

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

// REQUIRES_LIVE_DB (same convention as verify-alwaystrack-parity.mjs / verify-control-totals.mjs):
// excludes this guard from verify-static.mjs's dead-port sentinel sweep. live() fails closed
// without DATABASE_URL by design (ROUND 29.9-B) — a live money guard that cannot connect is a
// FAIL, never a pass.
export const REQUIRES_LIVE_DB = 'live() fails closed without DATABASE_URL by design (ROUND 29.9-B)';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LABEL = 'verify-settlement-net-equals-document';
const USMCA = '5c854333-6ea5-4faa-af31-67cb272fef80';
const GROUND_TRUTH_PATH = path.join(ROOT, 'data/alwaystrack/settlements-truth-2026-09-13.json');
const BYPASS = `WITH b AS MATERIALIZED (SELECT set_config('app.bypass_rls','lucia',true) AS v)`;

const round2Cents = (dollars) => Math.round(Number(dollars ?? 0) * 100);
const money = (cents) => (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Pure — { doc -> total_due_cents } for every driver-side document in the ground-truth file. */
export function loadDriverTotalDueByDoc(groundTruthPath = GROUND_TRUTH_PATH) {
  const raw = JSON.parse(fs.readFileSync(groundTruthPath, 'utf8'));
  const byDoc = new Map();
  for (const row of raw.driver ?? []) {
    if (row.total_due == null) continue;
    byDoc.set(String(row.settlement_no), round2Cents(row.total_due));
  }
  return byDoc;
}

/** Pure comparator — one settlement row vs its document's total-due cents. Used by --selftest and live(). */
export function compareSettlementToDocument(netPayCents, documentTotalDueCents) {
  return netPayCents === documentTotalDueCents ? null : netPayCents - documentTotalDueCents;
}

async function live() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(`${LABEL}: DATABASE_URL not set. Refusing to pass a money gate that never ran.`);
    process.exit(1);
  }
  const byDoc = loadDriverTotalDueByDoc();
  const client = new pg.Client({ connectionString: url });
  let failures = 0;
  let checked = 0;
  const misses = [];
  try {
    await client.connect();
    await client.query('BEGIN');
    const { rows } = await client.query(
      `${BYPASS}
       SELECT source_document_ref, display_id, net_pay, status
         FROM driver_finance.driver_settlements s
        WHERE (SELECT v FROM b)='lucia'
          AND s.operating_company_id = $1
          AND s.source_document_ref IS NOT NULL
          AND s.status <> 'cancelled'`,
      [USMCA]
    );
    await client.query('ROLLBACK');

    console.log(`  SETTLEMENT NET == DOCUMENT TOTAL DUE — live production, USMCA only\n`);
    for (const row of rows) {
      const docCents = byDoc.get(row.source_document_ref);
      if (docCents == null) continue; // no driver-side document on file for this ref — nothing to compare
      checked++;
      const netCents = round2Cents(row.net_pay);
      const delta = compareSettlementToDocument(netCents, docCents);
      if (delta === null) {
        console.log(`  PASS  ${row.display_id ?? row.source_document_ref} (doc ${row.source_document_ref}) net ${money(netCents)}`);
      } else {
        failures++;
        misses.push(row.source_document_ref);
        console.log(`  FAIL  ${row.display_id ?? row.source_document_ref} (doc ${row.source_document_ref})`);
        console.log(`        settlement net ${money(netCents)}   document TOTAL DUE ${money(docCents)}   delta ${money(delta)}`);
      }
    }
  } finally {
    await client.end().catch(() => {});
  }

  console.log('');
  if (failures) {
    console.error(`${LABEL}: FAIL — ${failures} of ${checked} settlement(s) with a signed document do not tie: ${misses.join(', ')}.`);
    console.error(`  Do not merge. Do not plug the difference. closeSettlementPayRun refuses these at close time too.\n`);
    process.exit(1);
  }
  console.log(`${LABEL}: LIVE PASS — ${checked} settlement(s) with a signed document on file, 0 mismatches.\n`);
}

function selftest() {
  const cases = [
    { name: 'exact tie', net: 198795, doc: 198795, expect: null },
    { name: '$50.00 over (AUTH-013-shape)', net: 199295, doc: 198795, expect: 500 },
    { name: '$25.00 under', net: 198545, doc: 198795, expect: -250 },
    { name: 'zero vs zero', net: 0, doc: 0, expect: null },
  ];
  let pass = 0;
  for (const c of cases) {
    const got = compareSettlementToDocument(c.net, c.doc);
    const ok = got === c.expect;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${c.name}${ok ? '' : ` — got ${got}, expected ${c.expect}`}`);
    if (ok) pass++;
  }
  // loadDriverTotalDueByDoc against the real ground-truth file — shape check only, no live DB.
  const byDoc = loadDriverTotalDueByDoc();
  const shapeOk = byDoc.size > 0 && byDoc.has('5753') && Number.isFinite(byDoc.get('5753'));
  console.log(`  ${shapeOk ? 'PASS' : 'FAIL'}  ground-truth file parses, 5753 present as a finite cents value`);
  if (shapeOk) pass++;
  const total = cases.length + 1;
  console.log(`\n${LABEL} --selftest: ${pass}/${total} PASS`);
  if (pass !== total) process.exit(1);
}

if (process.argv.includes('--selftest')) {
  selftest();
} else {
  await live();
}
