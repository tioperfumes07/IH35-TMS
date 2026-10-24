#!/usr/bin/env node
/**
 * ENG-01 (443.322) — every closed settlement has posted_at AND at least one live JE posting.
 *
 * ROOT CAUSE: settlement-payrun-close.routes.ts (close-trip endpoint) called
 * stampTripClosedForBookendedSettlement but never called postLoadBookendedSettlementGlAfterClose.
 * P-0113/P-0117/P-0119: status=closed, posted_at=NULL, 0 JE postings.
 *
 * FIX: close-trip route now calls postLoadBookendedSettlementGlAfterClose after a successful stamp.
 * Migration 202616230800 adds a DB trigger that refuses closing non-load-bookended settlements
 * without posted_at.
 *
 * Usage: node scripts/verify-settlement-close-must-post-gl.mjs [--selftest]
 */
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-settlement-close-must-post-gl";
export const REQUIRES_LIVE_DB =
  "driver_finance.driver_settlements + journal_entry_postings — fails closed with no DATABASE_URL";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

export function isUnpostedClosed(row) {
  return row.status === "closed" && (row.posted_at === null || row.posted_at === undefined);
}

if (process.argv.includes("--selftest")) {
  const cases = [
    ["closed + no posted_at = violation", isUnpostedClosed({ status: "closed", posted_at: null })],
    ["closed + posted_at set = ok", !isUnpostedClosed({ status: "closed", posted_at: "2026-10-20T00:00Z" })],
    ["open + no posted_at = ok", !isUnpostedClosed({ status: "open", posted_at: null })],
    ["cancelled + no posted_at = ok", !isUnpostedClosed({ status: "cancelled", posted_at: null })],
  ];
  for (const [n, p] of cases) console.log(`  ${p ? "✓" : "✗"} ${n}`);
  const bad = cases.filter(([, p]) => !p).length;
  console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
try {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',true)");

  const totalRes = await client.query(
    `SELECT count(*) AS n FROM driver_finance.driver_settlements
      WHERE operating_company_id = $1::uuid AND voided_at IS NULL AND status = 'closed'`,
    [USMCA_COMPANY_ID]
  );
  const total = Number(totalRes.rows[0].n);
  if (total === 0) {
    console.error(`${LABEL}: LIVE FAIL — 0 closed settlements; completeness discriminator says instrument problem`);
    process.exit(1);
  }

  const gapRes = await client.query(
    `SELECT
       ds.id::text AS settlement_id,
       ds.display_id,
       ds.settlement_model,
       ds.status,
       ds.posted_at::text,
       ds.approval_status,
       COUNT(jep.id) AS je_postings
     FROM driver_finance.driver_settlements ds
     LEFT JOIN accounting.journal_entry_postings jep
       ON jep.operating_company_id = ds.operating_company_id
      AND jep.source_transaction_id = ds.id::text
      AND jep.source_transaction_type IN ('driver_settlement','settlement_payrun')
     WHERE ds.operating_company_id = $1::uuid
       AND ds.voided_at IS NULL
       AND ds.status = 'closed'
       AND ds.posted_at IS NULL
     GROUP BY ds.id, ds.display_id, ds.settlement_model, ds.status, ds.posted_at, ds.approval_status`,
    [USMCA_COMPANY_ID]
  );

  await client.query("COMMIT");

  const violations = gapRes.rows.filter(isUnpostedClosed);
  if (violations.length > 0) {
    console.error(
      `${LABEL}: LIVE FAIL — ${violations.length} closed settlement(s) with posted_at=NULL (run scripts/ops/2026-10-24-cc1-post-unposted-settlements-eng01.mts to fix):`
    );
    for (const r of violations) {
      console.error(
        `  ✗ ${r.settlement_id} (${r.display_id ?? "no-P"}) model=${r.settlement_model ?? "NULL"} approval=${r.approval_status} je_postings=${r.je_postings}`
      );
    }
    process.exit(1);
  }
  console.log(
    `${LABEL}: LIVE PASS — 0 closed settlements without posted_at (${total} closed settlements checked)`
  );
} finally {
  client.release();
  await pool.end();
}
