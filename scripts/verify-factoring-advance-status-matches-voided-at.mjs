#!/usr/bin/env node
// ROUND 270 (Lead, P0) — accounting.factoring_advances.status can be left 'advanced' after
// voided_at is stamped: no factoring_advance case exists in governance/void-cancel-
// executors.ts's executeVoidCancel, so whatever voided a row used a raw UPDATE that set
// voided_at/void_reason without flipping status. MEASURED live 2026-09-30 on USMCA: 2 rows
// (1f09c82c... faro_invoice_number 1013272-2, invoice 13619; 9667e71c... faro_invoice_number 87,
// invoice 13615), both voided 2026-09-28, both still status='advanced'. This fooled two
// downstream readers: views.factoring_summary's mtd_advances CTE (filters
// `status IS DISTINCT FROM 'voided'`, so a mislabeled row still counts toward
// mtd_advances_count/mtd_advanced_total) and any reader deriving "this invoice is advanced" from
// factoring_advances.status via accounting.invoices.factoring_advance_id.
//
// This guard is the permanent backstop: after voided_at is set, status must equal 'voided'.
// Migration 202614570000 adds the same invariant as a NOT VALID database CHECK constraint (see
// that file for why NOT VALID); AUTH-132 corrects the 2 known rows; this guard is the live,
// independently-run proof the invariant holds, ratcheted to 0.
import { register } from "tsx/esm/api";

export const REQUIRES_LIVE_DB = "voided_at/status consistency is a live-data invariant; cannot connect = FAIL, never a silent pass";

register();

const LABEL = "verify-factoring-advance-status-matches-voided-at";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
// Shrink-only ratchet. AUTH-132 corrected both known-bad rows 2026-09-29 (status_before_void
// recorded, status flipped to 'voided'); constraint VALIDATEd (202614590000). 0 confirmed live.
const KNOWN_STATUS_VOID_MISMATCHES = 0;

async function selftest() {
  const failures = [];
  const t = (label, cond) => {
    if (!cond) failures.push(label);
  };

  // Can't hit a real DB in selftest; assert the ratchet constant shape only.
  t("ratchet baseline is a non-negative integer", Number.isInteger(KNOWN_STATUS_VOID_MISMATCHES) && KNOWN_STATUS_VOID_MISMATCHES >= 0);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest OK`);
}

async function main() {
  if (process.argv.includes("--selftest")) {
    await selftest();
    return;
  }
  if (!process.env.DATABASE_URL) {
    console.error(`${LABEL}: FAIL — DATABASE_URL not set. A live money guard that cannot connect is a FAIL, never a pass.`);
    process.exitCode = 1;
    return;
  }
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");

    const res = await client.query(
      `SELECT id::text, faro_invoice_number, status, voided_at
         FROM accounting.factoring_advances
        WHERE operating_company_id = $1::uuid
          AND voided_at IS NOT NULL
          AND status <> 'voided'
        ORDER BY id`,
      [USMCA]
    );

    await client.query("ROLLBACK");

    const n = res.rows.length;
    if (n > KNOWN_STATUS_VOID_MISMATCHES) {
      console.error(`${LABEL}: FAIL — ${n} row(s) have voided_at set but status <> 'voided', GREW past the ratchet baseline of ${KNOWN_STATUS_VOID_MISMATCHES}:`);
      for (const r of res.rows) console.error(`  ✗ ${r.id} (${r.faro_invoice_number ?? "no doc#"}) status='${r.status}' voided_at=${r.voided_at}`);
      process.exitCode = 1;
      return;
    }
    if (n < KNOWN_STATUS_VOID_MISMATCHES) {
      console.log(`${LABEL}: NOTE — ratchet improved (${n} < baseline ${KNOWN_STATUS_VOID_MISMATCHES}). Lower KNOWN_STATUS_VOID_MISMATCHES in this file to match.`);
    }
    console.log(`${LABEL}: PASS — ${n} row(s) with voided_at/status mismatch (ratchet baseline ${KNOWN_STATUS_VOID_MISMATCHES}, never grows).`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(`${LABEL}: FAIL —`, err);
  process.exitCode = 1;
});
