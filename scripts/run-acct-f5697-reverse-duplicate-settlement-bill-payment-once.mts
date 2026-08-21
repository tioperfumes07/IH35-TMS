/**
 * ACCT-F5697 DATA REPAIR — reverse the DUPLICATE bill-payment poster chain on S-2026-0002 (USMCA).
 *
 * Two mutually-unaware settlement GL posters both posted this settlement (see ACCT-F5697):
 *   - settlement-bill-payment-posting.service.ts's postSettlementBillPayment, 2026-08-11
 *     (JE b7575a45 "Bill L-20260810-0003 posting" + JE 8bc9947e "Bill payment ... posting") —
 *     Dr 6890 Cost of Labor $297.60 / Cr 1000 Bank $297.60, NO escrow withheld.
 *   - driver-finance/settlement-payrun-close.service.ts's closeSettlementPayRun, 2026-08-21
 *     (JE 5a652f56 "Settlement S-2026-0002 — pay-run close (net 4760c)") —
 *     Dr 6890 $297.60 / Cr Escrow $250.00 / Cr Bank $47.60.
 *
 * The payrun-close JE is the CORRECT one (escrow-aware, matches the real $250.00 withholding policy
 * and the driver's actual escrow_accounts balance). The bill-payment chain is the WRONG, extraneous
 * one — it pre-dates the escrow policy being wired up for this driver and paid out the FULL gross
 * with no escrow hold at all, which is not what actually happened (no cash left the bank; payment_state
 * stayed 'unpaid' throughout).
 *
 * This script reverses ONLY the bill-payment chain, using the poster's OWN established, tested
 * reversal primitive (reverseSettlementBillPayment) — never a hand-written UPDATE/DELETE, never new
 * GL math. WORM-safe: nothing is deleted, an equal-and-opposite reversing JE is posted.
 *
 * Usage:
 *   DATABASE_URL=<direct> DATABASE_DIRECT_URL=<direct> npx tsx scripts/run-acct-f5697-reverse-duplicate-settlement-bill-payment-once.mts [--commit]
 * Without --commit: dry-run only (reads and prints the current state, reverses NOTHING).
 */
import { reverseSettlementBillPayment } from "../apps/backend/src/accounting/settlement-posting/settlement-bill-payment-posting.service.ts";
import { Client } from "pg";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const SETTLEMENT_ID = "9910302b-35df-4882-955a-130b7fb29c7a"; // S-2026-0002
const COMMIT = process.argv.includes("--commit");

const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_DIRECT_URL required");
if (/-pooler\./.test(url)) throw new Error("REFUSING -pooler: session GUCs do not survive transaction pooling under FORCE RLS");

const client = new Client({ connectionString: url });
await client.connect();
await client.query("SET ROLE ih35_app");
await client.query("BEGIN");
await client.query("SET LOCAL app.bypass_rls = 'lucia'");
await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [USMCA]);

console.log("=== BEFORE ===");
const before = await client.query(
  `SELECT je.id::text, je.memo, je.voided_at, je.reversed_by_je_id::text
     FROM accounting.journal_entries je
    WHERE je.operating_company_id = $1::uuid
      AND je.id IN ('b7575a45-198f-4e84-a216-86df3f1a2351','8bc9947e-4fac-4d76-81c8-a3e52a0ae842','5a652f56-706e-4f24-9a12-154b8ab04f1c')
    ORDER BY je.created_at`,
  [USMCA]
);
console.log(JSON.stringify(before.rows, null, 2));
await client.query("COMMIT");
await client.end();

if (!COMMIT) {
  console.log("\nDRY RUN — pass --commit to actually reverse. Nothing changed.");
  process.exit(0);
}

console.log("\n=== REVERSING (reverseSettlementBillPayment, real poster primitive) ===");
const result = await reverseSettlementBillPayment(
  {
    operatingCompanyId: USMCA,
    settlementId: SETTLEMENT_ID,
    reason:
      "ACCT-F5697 data repair — duplicate settlement GL posting. This settlement was posted by BOTH " +
      "postSettlementBillPayment (2026-08-11, this chain, no escrow withheld) and closeSettlementPayRun " +
      "(2026-08-21, JE 5a652f56, escrow-aware and correct). Reversing this earlier, extraneous, " +
      "escrow-unaware chain so Cost of Labor and the operating bank both net to the correct real figures.",
  },
  { userId: ACTOR_USER_ID }
);
console.log(JSON.stringify(result, null, 2));
