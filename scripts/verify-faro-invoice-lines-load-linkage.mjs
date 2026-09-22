#!/usr/bin/env node
// ROUND 23.3 DELTA (owner, 2026-09-13) — "factor.faro_invoice_lines holds 34 live USMCA rows ...
// load_id IS NULL ON ALL 34. But 33 of those 34 invoice_number values ARE load numbers that
// ALREADY EXIST in mdata.loads ... Backfill load_id by exact match." That backfill ran live this
// session (34/34 now linked, including invoice_number '039' — resolved via accounting.invoices.
// display_id='039'.source_load_id, a real load [13554, Big G Logistics, $3,500.00], never
// invented). This guard is the one-line proof that stays true going forward: every live
// (superseded_at IS NULL) USMCA row must carry a real load_id, always, not just today.
//
// CANONICAL FARO SOURCE (owner asked this be named): factor.faro_invoice_lines (schema `factor`)
// is the live, populated USMCA source this guard checks — 34 rows, all linked. The separate
// factoring.faro-csv-import.ts / factoring.reserve_movement pipeline (schema `factoring`) is a
// DIFFERENT ingestion path with its own existing guard (verify-faro-import-linkage.mjs) — measured
// live this session at 0 USMCA rows in factoring.reserve_movement, and accounting.invoices has no
// display_id '013'/'061'/'062' for USMCA either. There is no live double-count to reconcile
// between the two for this entity today; nothing was mapped because the other pipeline is empty
// for USMCA. Flagging, not guessing: if that pipeline is ever populated for USMCA, whoever does it
// must re-run this same "is this row already in factor.faro_invoice_lines" check before trusting
// either source, or the exact "same money counted twice" risk the owner named will materialize.
//
// Fails closed with no DATABASE_URL (requireLiveDbOrExit, ROUND 29.9-B). money-pr-local-gate.mjs runs
// it only when this guard's own domain paths change or a live DB is present (Lead ruling R56-B).
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-faro-invoice-lines-load-linkage";
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

    const res = await client.query(
      `SELECT invoice_number, customer_name, gross_amount_cents
         FROM factor.faro_invoice_lines
        WHERE operating_company_id = $1::uuid AND superseded_at IS NULL AND load_id IS NULL`,
      [USMCA_COMPANY_ID]
    );
    const totalRes = await client.query(
      `SELECT count(*) AS n FROM factor.faro_invoice_lines WHERE operating_company_id = $1::uuid AND superseded_at IS NULL`,
      [USMCA_COMPANY_ID]
    );
    const total = Number(totalRes.rows[0].n);
    if (total === 0) {
      console.error(`${LABEL}: LIVE FAIL — 0 live USMCA factor.faro_invoice_lines rows found; completeness discriminator says this is an instrument problem, not a real zero — re-run before trusting this`);
      process.exit(1);
    }

    if (res.rows.length > 0) {
      console.error(`${LABEL}: LIVE FAIL — ${res.rows.length} of ${total} live USMCA faro_invoice_lines row(s) have no load_id:`);
      for (const r of res.rows) {
        console.error(`  ✗ invoice_number=${r.invoice_number} customer=${r.customer_name} gross=$${(Number(r.gross_amount_cents) / 100).toFixed(2)}`);
      }
      process.exit(1);
    }
    await client.query("COMMIT");
    console.log(`${LABEL}: LIVE PASS — ${total}/${total} live USMCA faro_invoice_lines rows carry a real load_id.`);
  } finally {
    client.release();
    await pool.end();
  }
}

await live();
