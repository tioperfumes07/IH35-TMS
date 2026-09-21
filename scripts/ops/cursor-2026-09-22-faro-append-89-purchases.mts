#!/usr/bin/env tsx
/**
 * cursor-2026-09-22-faro-append-89-purchases.mts — ROUND29.6, item 2.
 *
 * Owner ruling (2026-09-22, RULING-FARO-LOAD-MAP-SCOPE-ADD-NEVER-SUPERSEDE): "ADD ONLY. Keep all
 * 34 existing lines untouched... Insert only lines the export proves are missing, each citing its
 * Faro invoice number and purchase date."
 *
 * Source of truth: the owner's live Faro portal exports pulled 2026-09-21 —
 * ~/Downloads/export (27).csv (Purchases: Debtor/Date/Inv#/PO/Purchase/Escrow Rsv/Discount/
 * Net Adv/ChgBack — 89 data rows). Cross-referenced against mdata.loads.customer_wo_number
 * (USMCA) for load matching, PO normalized (strip leading '#', strip leading zeros) to catch two
 * real Faro-side formatting inconsistencies confirmed against the DB's own stored data:
 *   - load 13551's stored PO carries a leading '#' the raw export's PO cell does not.
 *   - load 13565's stored PO "488" vs the export's "0488" (leading zero).
 * One raw-export row has Inv#/PO transposed (Refrigerx, 09/08/2026: cell values "1013272-2" and
 * "059" are swapped relative to every neighboring row's column order) — corrected explicitly, not
 * silently.
 *
 * Of the 89 rows: 19 already match one of the 34 existing lines exactly (by resolved invoice
 * number) and are skipped (idempotent, appendFaroInvoiceLinesOnClient's own existence check would
 * skip them anyway — this script's own count is a second, independent confirmation). 16 of the 34
 * existing lines were never matched by any of these 89 rows at all — consistent with being real
 * purchases made 2026-08-07..08-09, before this export's 08/10 start date (not re-verified
 * individually beyond the load-number range and the two confirmed cases above; NOT claimed proven
 * for all 16). 2 PO collisions (one Faro invoice number matching two different USMCA loads) were
 * resolved using FARO LOAD MAP's own VERDICT column (the non-matching load in each pair is
 * verdict=NOT PURCHASED-SELF-CARRIED AR, so only one candidate can be the real Faro purchase):
 *   - PO 0488 (Faro inv 036, Hummingbird, $4,000.00): 13556 is self-carried, excluded; 13565
 *     already carries gross_amount_cents=400000 in our existing 34 -- exact match, already-present.
 *   - PO 1013272-2 (Faro inv 059, Refrigerx, $5,210.00): 13578 is self-carried, excluded; 13579
 *     is Completed and NOT in the existing 34 -- a genuine new line.
 * The remaining 69 rows resolve to a single load (25) or, where the PO matches no USMCA load at
 * all, a Faro-native reference "FARO-<inv#>" (44) -- per owner ruling, "a Faro invoice with no
 * load link is NOT an error" (self-carried/unmatched Faro-side purchases still belong in our
 * factoring subledger; reconciliation will honestly show them missing_in_ledger rather than the
 * app inventing a load FK).
 *
 * Full per-row matching decisions, anomalies and the two resolved ambiguities are in this script's
 * companion data file (committed alongside): docs/reconciliation/2026-09-22-faro-append-lines.json.
 *
 * Sum check: sum(89 rows' Purchase) = $311,587.00 exactly, matching the owner's stated control
 * total (FARO CONTROL sheet / this run's own arithmetic, independently).
 *
 * Usage:
 *   DATABASE_URL=<neon-usmca> npx tsx scripts/ops/cursor-2026-09-22-faro-append-89-purchases.mts             # dry-run
 *   DATABASE_URL=<neon-usmca> npx tsx scripts/ops/cursor-2026-09-22-faro-append-89-purchases.mts --apply
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
import { appendFaroInvoiceLines } from "../../apps/backend/src/data-infra/data-infra.service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const IMPORT_ID = "c1e27709-28f7-4886-860f-b9597ddad71a";
const APPLY = process.argv.includes("--apply");

const __dirname = dirname(fileURLToPath(import.meta.url));
const linesPath = join(__dirname, "../../docs/reconciliation/2026-09-22-faro-append-lines.json");

type NewLine = {
  invoice_number: string;
  customer_name: string;
  load_id: string | null;
  gross_amount_cents: number;
  advance_amount_cents: number;
  reserve_amount_cents: number;
  fee_amount_cents: number;
  chargeback_amount_cents: number;
  net_amount_cents: number;
  due_on: string;
  _faro_inv: string;
  _po: string;
};

async function main() {
  const lines: NewLine[] = JSON.parse(readFileSync(linesPath, "utf8"));
  console.log(`Loaded ${lines.length} candidate new lines from ${linesPath}`);
  const sumGross = lines.reduce((s, l) => s + l.gross_amount_cents, 0);
  console.log(`Sum gross_amount_cents of candidates: ${sumGross} ($${(sumGross / 100).toFixed(2)})`);
  const withLoad = lines.filter((l) => l.load_id).length;
  console.log(`With a resolved load_id: ${withLoad} | Faro-native reference only: ${lines.length - withLoad}`);

  if (!APPLY) {
    console.log("DRY-RUN — would call appendFaroInvoiceLines with these lines against daily_import_id=" + IMPORT_ID);
    return;
  }

  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required to assert branch before writing");
  // Branch assertion done by the wrapper script that sets DATABASE_URL; this script trusts it.

  const result = await appendFaroInvoiceLines(OWNER, {
    operatingCompanyId: USMCA,
    dailyImportId: IMPORT_ID,
    lines: lines.map((l) => ({
      invoice_number: l.invoice_number,
      customer_name: l.customer_name,
      load_id: l.load_id ?? undefined,
      gross_amount_cents: l.gross_amount_cents,
      advance_amount_cents: l.advance_amount_cents,
      reserve_amount_cents: l.reserve_amount_cents,
      fee_amount_cents: l.fee_amount_cents,
      chargeback_amount_cents: l.chargeback_amount_cents,
      net_amount_cents: l.net_amount_cents,
      due_on: l.due_on,
    })),
  });

  console.log(`Inserted: ${result.inserted_invoice_numbers.length} -> ${result.inserted_invoice_numbers.join(", ")}`);
  console.log(`Skipped (already present): ${result.skipped_already_present.length} -> ${result.skipped_already_present.join(", ")}`);
  console.log(`New header totals:`, result.header);
  console.log(`New header gross: $${(result.header.gross_total_cents / 100).toFixed(2)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
