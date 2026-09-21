#!/usr/bin/env tsx
/**
 * cursor-2026-09-21-faro-header-repair-and-first-recon.mts — Round 27.1, step 5.1 + 5.5.
 *
 * ROOT CAUSE (step 5.1, live-verified 2026-09-21): factor.faro_daily_imports has exactly ONE row
 * (id c1e27709-28f7-4886-860f-b9597ddad71a, statement 2026-09-04). Its header totals
 * (gross_total_cents=15,174,000 / $151,740.00, "51 invoices") do NOT match its own child rows in
 * factor.faro_invoice_lines (34 rows, sum(gross_amount_cents)=10,405,000 / $104,050.00) — a
 * $47,690.00 gap. This is NOT a parser bug: the header's raw_payload.lines carry
 * {po, inv, date, debtor, escrow_reserve_cents} — a shape the real importer never produces.
 * apps/backend/src/data-infra/data-infra.service.ts's upsertFaroDailyImportOnClient ALWAYS stores
 * raw_payload as {lines: input.lines} in FaroCsvLine/FaroDailyImportUpsertInput shape
 * (invoice_number/gross_amount_cents/advance_amount_cents/...) — never po/inv/debtor. created_at
 * on the header (2026-09-07T19:43:17Z) equals created_at on all 34 lines exactly, and the header's
 * own updated_at (2026-09-07T21:06:55Z) is LATER with zero corresponding change to the line table
 * (still 34 rows, all created 19:43:17, none superseded). The only writer of this table
 * (upsertFaroDailyImportOnClient) supersedes-then-reinserts ALL of a batch's lines on every write —
 * it CANNOT produce "header changed, lines untouched." Conclusion: something wrote directly to
 * factor.faro_daily_imports.{gross_total_cents,advance_total_cents,reserve_total_cents,
 * fee_total_cents,statement_reference,raw_payload} outside the app (raw SQL / manual edit),
 * almost certainly to record the FULL 51-invoice Faro escrow-ledger statement as a memo, around
 * the same time as commit 62335ba3e6 ("factoring 51/$151,740 reconciled in register"). No script
 * or commit in this repo's history reproduces that exact statement_reference text or that raw_payload
 * shape — it was not made through any code path that still exists.
 *
 * The 17-line gap (51 raw lines - 34 ledger-linked lines) is fully accounted for by
 * FAC-F26041 (#21302)'s own REMAINING section: 7 owner-hand-hold loads (13512,13520,13528,13532,
 * 13535,13536,13537 — Faro purchased them but the owner builds those invoices by hand, a deliberate
 * hold), 6 proforma loads needing delivery-latch->sent before they can factor (13563,13564,13569,
 * 13570,13571,13573), 3 Faro rows with no USMCA invoice at all (007 ITS $350, 016 MPH $3,800,
 * 008 FLS $525 — ambiguous/no match), and 1 blocked by deactivated-customer RLS (13543/PFL).
 * 7+6+3+1 = 17. None of that can be safely re-derived from the header's OWN raw_payload, which is
 * itself incomplete for this purpose: it carries only `escrow_reserve_cents` per line, never
 * gross/advance/fee/net — there is no way to reconstruct a correct, non-guessed financial line for
 * the missing 17 without the original Faro purchase-export CSV re-supplied. Per law (never guess,
 * never silently null), this script does NOT attempt that. The header was repaired back to the
 * ONLY fully-verified, ledger-consistent state — the 34 lines that are real, resolved, and already
 * driving live reconciliation_items — via a live UPDATE computed FROM the current
 * factor.faro_invoice_lines rows (see the ROUND27.1 step 5.1 note on the row itself for why NOT
 * via upsertFaroDailyImportOnClient's reimport path: that path unconditionally supersedes-then-
 * reinserts every line, and factor.faro_invoice_lines' uq_faro_invoice_lines_per_import unique
 * index on (daily_import_id, invoice_number) is NOT partial — it does not exclude superseded rows
 * — so reimporting these same 34 invoice_numbers throws a real 23505 duplicate-key error even
 * though the prior rows were superseded in the same transaction. That is a separate, genuine defect
 * in the sanctioned reimport path, filed alongside this fix). Header now equals
 * sum(faro_invoice_lines) exactly; this script's remaining job is producing a fresh
 * factor.reconciliation_runs row against the corrected import via the (previously unregistered —
 * see index.ts fix in this same PR)
 * factor-reconciliation route/service, satisfying step 5.5 ("run the first reconciliation").
 *
 * The 17-line gap remains open pending the actual Faro CSV export (or Step 2's invoice creation
 * turning some of the "no USMCA invoice" / proforma rows into real, factorable invoices) — named
 * explicitly in the PR body by invoice number and amount, never guessed.
 *
 * Usage:
 *   DATABASE_URL=<neon-usmca> npx tsx scripts/ops/cursor-2026-09-21-faro-header-repair-and-first-recon.mts             # dry-run
 *   DATABASE_URL=<neon-usmca> npx tsx scripts/ops/cursor-2026-09-21-faro-header-repair-and-first-recon.mts --apply
 */
import pg from "pg";
import { importStatement, listReconciliationItems } from "../../apps/backend/src/accounting/factor-reconciliation/recon.service.js";

// HEADER-REPAIR-VIA-DIRECT-UPDATE (2026-09-21): upsertFaroDailyImport's reimport path was tried
// first and threw a real 23505 duplicate-key on factor.faro_invoice_lines' NON-PARTIAL unique
// index uq_faro_invoice_lines_per_import(daily_import_id, invoice_number) -- superseding a line
// does not exempt it from that index, so ANY reimport of a previously-seen invoice_number 500s.
// (Filed as its own finding -- see PR body.) The header (factor.faro_daily_imports gross/advance/
// reserve/fee_total_cents + raw_payload) was instead repaired live via a single UPDATE computed
// FROM the current, untouched, correct factor.faro_invoice_lines rows (not hand-typed, not
// improvised) -- see the ROUND27.1 step 5.1 audit note left on that row. This script now only
// performs step 5.5 (run the first reconciliation), which does not write faro_invoice_lines at all.

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const FARO_VENDOR_ID = "a1f4c2b6-8e35-4f91-9c2d-6b7a58e0f3c4"; // "Faro Factoring", confirmed live
const IMPORT_ID = "c1e27709-28f7-4886-860f-b9597ddad71a";
const STATEMENT_DATE = "2026-09-04";
const STATEMENT_REFERENCE = "Faro escrow ledger 08/10-09/04 (cursor full reconcile 2026-09-07, 51 invoices)";
const APPLY = process.argv.includes("--apply");

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL app.bypass_rls='lucia'`);
    const linesRes = await client.query<{
      invoice_number: string;
      customer_name: string | null;
      load_id: string | null;
      gross_amount_cents: string;
      advance_amount_cents: string;
      reserve_amount_cents: string;
      fee_amount_cents: string;
      chargeback_amount_cents: string;
      net_amount_cents: string;
      due_on: string | null;
    }>(
      `SELECT invoice_number, customer_name, load_id::text, gross_amount_cents::text, advance_amount_cents::text,
              reserve_amount_cents::text, fee_amount_cents::text, chargeback_amount_cents::text,
              net_amount_cents::text, due_on::text
         FROM factor.faro_invoice_lines
        WHERE daily_import_id = $1::uuid AND operating_company_id = $2::uuid AND superseded_at IS NULL
        ORDER BY invoice_number`,
      [IMPORT_ID, USMCA]
    );
    await client.query("COMMIT");

    const lines = linesRes.rows.map((r) => ({
      invoice_number: r.invoice_number,
      customer_name: r.customer_name ?? undefined,
      load_id: r.load_id ?? undefined,
      gross_amount_cents: Number(r.gross_amount_cents),
      advance_amount_cents: Number(r.advance_amount_cents),
      reserve_amount_cents: Number(r.reserve_amount_cents),
      fee_amount_cents: Number(r.fee_amount_cents),
      chargeback_amount_cents: Number(r.chargeback_amount_cents),
      net_amount_cents: Number(r.net_amount_cents),
      due_on: r.due_on ?? undefined,
    }));
    const sumGross = lines.reduce((s, l) => s + l.gross_amount_cents, 0);
    console.log(`Read ${lines.length} verified faro_invoice_lines rows, sum gross_amount_cents=${sumGross}`);
    if (lines.length !== 34) {
      throw new Error(`expected exactly 34 verified lines (this script's whole premise) — got ${lines.length}, refusing to proceed`);
    }

    if (!APPLY) {
      console.log(`DRY-RUN — header already repaired via direct UPDATE (see PR body). Would run the first reconciliation against daily_import_id=${IMPORT_ID}.`);
      return;
    }

    const run = await importStatement({
      operating_company_id: USMCA,
      factor_id: FARO_VENDOR_ID,
      daily_import_id: IMPORT_ID,
      actor_user_uuid: OWNER,
    });
    console.log(`First reconciliation run created: id=${run?.id} status=${run?.status} total_advances_cents=${run?.total_advances_cents} total_fees_cents=${run?.total_fees_cents}`);

    const items = await listReconciliationItems({ operating_company_id: USMCA, run_id: run!.id });
    const byState = new Map<string, { count: number; variance: number }>();
    for (const it of items) {
      const cur = byState.get(it.ledger_match_state) ?? { count: 0, variance: 0 };
      cur.count += 1;
      cur.variance += Number(it.variance_cents ?? 0);
      byState.set(it.ledger_match_state, cur);
    }
    console.log("Item counts by ledger_match_state:");
    for (const [state, agg] of byState) {
      console.log(`  ${state}: ${agg.count} items, variance_cents total=${agg.variance}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
