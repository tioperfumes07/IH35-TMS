#!/usr/bin/env tsx
/**
 * cursor-2026-09-22-faro-dispute-window-p0.mts — P0, CC-2 critical path, unblocks CC-3's branch
 * stack (verify-dispute-window-unified.mjs).
 *
 * Live at investigation time: 3 of the guard's Faro-vs-face variance rows have no
 * accounting.invoice_disputes row (the guard's own list has moved since the owner's snapshot —
 * production is live; re-derived fresh, not worked from the stale list):
 *   1. 13524 — invoice 58e72525 (display_id '13524') is VOIDED ($4,200.00, void_reason
 *      "TRANSPORTATION-NOT-USMCA ... seed contamination quarantined", CC-3's cleanup) — a real
 *      replacement invoice ALREADY EXISTS and ties to Faro exactly: INV-2026-00008, $3,800.00,
 *      status='sent', matches factor.faro_invoice_lines '13524' gross_amount_cents exactly. The
 *      "variance" is an artifact of the guard joining a superseded voided invoice, not real money.
 *      Dispute opened RESOLVED, citing INV-2026-00008 as the resolution.
 *   2. 13587 (Key Global, Faro inv 070) — invoice cba2f6be is still 'proforma' ($4,000.00) while
 *      the load is already 'delivered' and Faro purchased $4,120.00. Same shape as the existing
 *      13589/Kirsch dispute (reason_code='under_billing', owner ruling 2026-09-13: over/under both
 *      open a dispute). Genuinely open — the proforma needs to be finalized at $4,120.00.
 *   3. 13579 — THE SERIOUS ONE. Invoice f5f004bb (display_id '13579') is VOIDED at $0.00
 *      (CC-1's 2026-09-07 test-cleanup void, MANUAL-DELIVERY-AUTH-01). Unlike 13524, there is
 *      NO replacement invoice — load 13579's own customer_wo_number ('1013272-2') matches Faro
 *      invoice #59 (Refrigerx, gross $5,210.00, advance $5,053.70, due 09/08) exactly, confirming
 *      the LINK is correct, not a mismatch. Faro genuinely advanced $5,053.70 in real cash against
 *      an invoice that, in our own books, does not currently exist as a live document — only the
 *      voided $0 test row carries this display_id. Real, live cash exposure. Dispute opened OPEN,
 *      reason_code='other' (none of the enum values name "voided predecessor never replaced" and
 *      this script does not invent one), reason_text states the exposure plainly and does NOT
 *      guess whether the resolution is re-issuing the invoice or a repurchase — that determination
 *      needs the rate confirmation / Faro's own statement, which this script does not have.
 *
 * Usage:
 *   DATABASE_URL=<neon-usmca> npx tsx scripts/ops/cursor-2026-09-22-faro-dispute-window-p0.mts             # dry-run
 *   DATABASE_URL=<neon-usmca> npx tsx scripts/ops/cursor-2026-09-22-faro-dispute-window-p0.mts --apply
 */
import pg from "pg";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const APPLY = process.argv.includes("--apply");

type Row = {
  invoiceId: string;
  displayId: string;
  disputedCents: number;
  invoicedCents: number;
  expectedCents: number;
  reasonCode: string;
  reasonText: string;
  resolved: boolean;
  resolutionType?: string;
  resolutionText?: string;
};

const ROWS: Row[] = [
  {
    invoiceId: "58e72525-be74-4121-bade-7f4788c8cefd",
    displayId: "13524",
    disputedCents: 40000,
    invoicedCents: 420000,
    expectedCents: 380000,
    reasonCode: "mis_entry",
    reasonText:
      "Load 13524's original invoice (this row, $4,200.00) was voided 2026-09-05 as TRANSPORTATION-entity seed contamination (CC-3's USMCA quarantine cleanup) -- it was never a real USMCA receivable. The real, live, correct invoice is INV-2026-00008 ($3,800.00, status=sent), which ties EXACTLY to factor.faro_invoice_lines '13524' (Faro gross $3,800.00). This variance is an artifact of the dispute guard joining the superseded voided invoice by source_load_id, not real money -- tracked here so the guard's coverage assertion is honest, not silently ignored.",
    resolved: true,
    resolutionType: "invoice_corrected",
    resolutionText: "Superseded by INV-2026-00008, which ties exactly to Faro's $3,800.00 purchase. No action needed on this voided row.",
  },
  {
    invoiceId: "cba2f6be-5545-4587-9146-49e19043ebd5",
    displayId: "13587",
    disputedCents: 12000,
    invoicedCents: 400000,
    expectedCents: 412000,
    reasonCode: "under_billing",
    reasonText:
      "UNDER-BILLING (owner ruling 2026-09-13: over/under-payment both open a dispute). We proforma-invoiced $4,000.00 to Key Global Logistics, Inc (load 13587, delivered) but Faro purchased $4,120.00 (Faro inv 070, PO 131527406). Invoice kept at billed face; A/R stays OPEN for the +$120.00 under-billed. Figure & fix: finalize the proforma at the correct $4,120.00 face (invoice_corrected) before sending.",
    resolved: false,
  },
  {
    invoiceId: "f5f004bb-f9c3-47fd-83f7-bcd91b7909c7",
    displayId: "13579",
    disputedCents: 521000,
    invoicedCents: 0,
    expectedCents: 521000,
    reasonCode: "other",
    reasonText:
      "REAL CASH EXPOSURE -- not a data-quality artifact. Invoice 13579 is VOIDED at $0.00 (CC-1, 2026-09-07, MANUAL-DELIVERY-AUTH-01 test-cleanup void) and NO replacement invoice exists for load 13579. Load 13579's own customer_wo_number ('1013272-2') matches Faro invoice #59 (Refrigerx Transportation LLC, gross $5,210.00, advance $5,053.70, due 09/08/2026) exactly -- the load-to-Faro-purchase LINK is verified correct, not a mismatch. Faro genuinely advanced $5,053.70 in real cash against a receivable that, in our own books, has no live invoice document. Whether the correct resolution is RE-ISSUING the real invoice (if the underlying freight/delivery is confirmed real -- load status is 'invoiced', consistent with real freight) or a REPURCHASE OBLIGATION back to Faro (if the receivable is genuinely invalid) requires the rate confirmation and/or Faro's own statement for this specific invoice, which this script does not have access to and will not guess. Left OPEN. Flagged loudly, not silently.",
    resolved: false,
  },
];

async function main() {
  console.log(`${ROWS.length} disputes to open (1 resolved, 2 open):`);
  for (const r of ROWS) {
    console.log(`  ${r.displayId}: $${(r.disputedCents / 100).toFixed(2)} disputed, reason=${r.reasonCode}, resolved=${r.resolved}`);
  }

  if (!APPLY) {
    console.log("DRY-RUN — would insert 3 accounting.invoice_disputes rows.");
    return;
  }

  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [USMCA]);

    for (const r of ROWS) {
      const existing = await client.query(
        `SELECT id FROM accounting.invoice_disputes WHERE operating_company_id = $1::uuid AND invoice_id = $2::uuid`,
        [USMCA, r.invoiceId]
      );
      if (existing.rows[0]) {
        console.log(`${r.displayId}: dispute already exists (${existing.rows[0].id}). Skipping.`);
        continue;
      }

      const status = r.resolved ? "resolved" : "open";
      const res = await client.query<{ id: string }>(
        `INSERT INTO accounting.invoice_disputes
           (operating_company_id, invoice_id, disputed_amount_cents, invoiced_amount_cents,
            expected_amount_cents, reason_code, reason_text, status,
            resolution_type, resolution_text, opened_at, opened_by_user_id,
            resolved_at, resolved_by_user_id, source_system, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8,
                 $9, $10, now(), $11::uuid,
                 ${r.resolved ? "now()" : "NULL"}, ${r.resolved ? "$11::uuid" : "NULL"},
                 'cc2-round30.4-dispute-window-p0', now(), now())
         RETURNING id::text`,
        [
          USMCA,
          r.invoiceId,
          r.disputedCents,
          r.invoicedCents,
          r.expectedCents,
          r.reasonCode,
          r.reasonText,
          status,
          r.resolutionType ?? null,
          r.resolutionText ?? null,
          OWNER,
        ]
      );
      console.log(`${r.displayId}: inserted dispute ${res.rows[0].id} (status=${status}).`);
    }

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
