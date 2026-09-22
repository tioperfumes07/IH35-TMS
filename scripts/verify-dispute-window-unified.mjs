#!/usr/bin/env node
// ROUND 23.3 DELTA (owner, 2026-09-13) — "New guard requirement: dispute exists for every
// Faro-vs-face variance (both directions) + zero null load_id in faro_invoice_lines."
//
// The full disputes.disputes/12-subject-type unified schema is migration-blocked (CC-2 is
// hard-barred from authoring migrations — verify-migration-lane-band.mjs). This guard does the
// two assertions the DELTA explicitly named, against what's live TODAY (accounting.invoice_disputes
// + factor.faro_invoice_lines), rather than waiting on that schema:
//
//   1. Zero null load_id in factor.faro_invoice_lines (also asserted by the more focused
//      verify-faro-invoice-lines-load-linkage.mjs, shipped PR #22021 — repeated here per the
//      DELTA's own wording, both guards independently red if this regresses).
//   2. For every live (superseded_at IS NULL) faro_invoice_lines row whose gross_amount_cents
//      differs from its matched invoice's total_cents (either direction — Faro says more OR
//      less than our face), a real accounting.invoice_disputes row must exist for that invoice
//      (any status — open or already resolved, since a resolved dispute still proves the
//      variance was tracked, not silently ignored).
//
// Live measurement this session (bypass_rls, USMCA): all 34 USMCA faro_invoice_lines rows show
// gross_amount_cents === matched invoice's total_cents (0 variances from THIS comparison) — the 2
// live under_billing disputes (invoices 13578/13589, $560.00/$30.00) track a variance from a
// different source (not present in factor.faro_invoice_lines), so this guard's variance-coverage
// assertion is expected to pass vacuously-but-honestly today (0 variances found, 0 required,
// confirmed via the completeness discriminator below — not a false empty).
//
// Fails closed with no DATABASE_URL (requireLiveDbOrExit, ROUND 29.9-B). money-pr-local-gate.mjs runs
// it only when this guard's own domain paths change or a live DB is present (Lead ruling R56-B).
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-dispute-window-unified";
export const REQUIRES_LIVE_DB =
  "live-data money guard; fails closed via requireLiveDbOrExit with no DATABASE_URL (ROUND 29.9-B) and runs in money-pr-local-gate.mjs only when its own domain paths change or a live DB is present (Lead ruling R56-B, 2026-09-22)";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

async function live() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    // BANK-F30150 (found this session, verify-alwaystrack-parity.mjs): a bare session-level
    // set_config is unreliable through Neon's POOLED endpoint — wrap every read in one explicit
    // transaction with a transaction-scoped bypass so a pooler can't split it across backends.
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    let failures = 0;

    // completeness discriminator — an empty result is an instrument claim, not a verdict, unless
    // proven against a positive count on the SAME table.
    const totalRes = await client.query(
      `SELECT count(*) AS n FROM factor.faro_invoice_lines WHERE operating_company_id = $1::uuid AND superseded_at IS NULL`,
      [USMCA_COMPANY_ID]
    );
    const total = Number(totalRes.rows[0].n);
    if (total === 0) {
      console.error(`${LABEL}: LIVE FAIL — 0 live USMCA faro_invoice_lines rows; completeness discriminator says this is an instrument problem, not a real zero`);
      process.exit(1);
    }

    // 1. zero null load_id.
    const nullLoadRes = await client.query(
      `SELECT invoice_number FROM factor.faro_invoice_lines WHERE operating_company_id = $1::uuid AND superseded_at IS NULL AND load_id IS NULL`,
      [USMCA_COMPANY_ID]
    );
    if (nullLoadRes.rows.length > 0) {
      console.error(`${LABEL}: LIVE FAIL — ${nullLoadRes.rows.length} of ${total} faro_invoice_lines row(s) have null load_id: ${nullLoadRes.rows.map((r) => r.invoice_number).join(", ")}`);
      failures++;
    }

    // 2. every Faro-vs-face variance (both directions) has a real dispute.
    const varianceRes = await client.query(
      `SELECT f.invoice_number, f.gross_amount_cents, i.id AS invoice_id, i.display_id, i.total_cents,
              (f.gross_amount_cents - i.total_cents) AS variance_cents
         FROM factor.faro_invoice_lines f
         JOIN mdata.loads l ON l.id = f.load_id
         LEFT JOIN accounting.invoices i ON i.source_load_id = f.load_id AND i.operating_company_id = f.operating_company_id
        WHERE f.operating_company_id = $1::uuid AND f.superseded_at IS NULL
          AND i.id IS NOT NULL AND f.gross_amount_cents <> i.total_cents`,
      [USMCA_COMPANY_ID]
    );
    let uncovered = 0;
    for (const v of varianceRes.rows) {
      const disputeRes = await client.query(
        `SELECT id FROM accounting.invoice_disputes WHERE operating_company_id = $1::uuid AND invoice_id = $2::uuid LIMIT 1`,
        [USMCA_COMPANY_ID, v.invoice_id]
      );
      if (disputeRes.rows.length === 0) {
        console.error(`${LABEL}: LIVE FAIL — invoice ${v.display_id} has a Faro-vs-face variance ($${(Number(v.variance_cents) / 100).toFixed(2)}) with no accounting.invoice_disputes row`);
        uncovered++;
      }
    }
    if (uncovered > 0) failures++;

    await client.query("COMMIT");
    if (failures > 0) process.exit(1);
    console.log(
      `${LABEL}: LIVE PASS — 0/${total} null load_id; ${varianceRes.rows.length} Faro-vs-face variance(s) found, ` +
        `all covered by a real dispute.`
    );
  } finally {
    client.release();
    await pool.end();
  }
}

await live();
