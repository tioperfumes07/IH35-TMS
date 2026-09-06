#!/usr/bin/env tsx
/**
 * scripts/ops/set24-correction-dry-run.ts — SET-24 $172.44 CORRECTION (owner ruling ROUND 16.9,
 * 2026-09-06). 4 closed USMCA settlements carried duplicated reimbursements in their net pay
 * (SET-24 sweep, PR #21093) — since all 14 closed settlements are payment_state='unpaid', no driver
 * has actually been overpaid yet, and the frozen closed-settlement totals stay frozen (owner
 * confirmed). RULING: the correction is a post-close deduction on each driver's NEXT settlement —
 * deduction_type 'other', amount = that driver's duplicated total, account = the reimbursement's
 * ORIGINAL expense account (it reverses an expense, not income), memo = the voided duplicate
 * reimbursement ids.
 *
 * NONE of the 4 affected drivers currently has an open settlement (live-verified: the only 2 open
 * USMCA settlements, S-13651/S-13653, belong to two OTHER drivers entirely) — so "the driver's next
 * settlement" does not exist yet. Uses createSettlementDeduction (deductions.service.ts) the same
 * way every other real caller does: applied_to_settlement_id=NULL at creation (a genuinely PENDING
 * deduction), which the existing close-time sweep / creation-time materializer automatically
 * attaches to whichever settlement covers this driver next — never a raw INSERT, never a settlement
 * chosen by guesswork.
 *
 * ACCOUNT-ROUTING GAP (found live, not fixed here, flagging before any code change): deduction_type
 * 'other' resolves generically via the other_recovery CoA role at settlement close time
 * (settlement-lines-materialize.service.ts / classifyDeductionTarget()) -> account 7200 "Driver
 * Admin Fee & Chargeback Income" (an INCOME account) -- exactly what this ruling says NOT to use.
 * The account the ruling actually wants -- "the reimbursement's ORIGINAL expense account" -- is
 * live-verified to be the SAME for all 4 duplicated rows regardless of their individual reason text
 * (Lumper / Fuel-DEF / Bonus / Layover all route through the ONE reimbursement_expense CoA role ->
 * account DRIVERTRIPLU056412 "Driver Trip-Lumper Reimbursement" when a reimbursement materializes).
 * Nothing in the current deduction pipeline routes an 'other'-typed deduction to
 * reimbursement_expense instead of other_recovery -- that needs either a scoped code change (a
 * distinguishing marker this correction sets, honored by settlement-lines-materialize.service.ts's
 * deduction branch) or a different representation entirely. NOT decided or built here -- creating
 * the row is safe/reversible (void-not-delete) either way, but I will not silently ship a code
 * change that changes real GL routing without the owner's read on this specific finding first.
 *
 * `--dry-run` (default): prints the 4 rows, no writes.
 * `--apply`: creates the 4 pending deductions (requires LEAD_APPROVAL_QUOTE below, verbatim).
 *
 * Usage:
 *   DATABASE_URL=<neon prod> npx tsx scripts/ops/set24-correction-dry-run.ts --dry-run
 *   DATABASE_URL=<neon prod> npx tsx scripts/ops/set24-correction-dry-run.ts --apply
 */
import pg from "pg";
import { createSettlementDeduction } from "../../apps/backend/src/driver-finance/deductions.service.js";
import { withCurrentUser } from "../../apps/backend/src/auth/db.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

// Filled in only once the owner's ✔ quote for this specific correction (and the account-routing
// gap above) is posted verbatim to docs/bus/OUTBOX-CC-3.md — never before.
const LEAD_APPROVAL_QUOTE = "";

const CORRECTIONS: Array<{
  settlement_display_id: string; // the CLOSED settlement that carried the duplicate — cited in the memo only
  driver_name: string;
  driver_id: string;
  amount_cents: number;
  voided_reimbursement_ids: string[];
}> = [
  {
    settlement_display_id: "S-13646",
    driver_name: "Luis Armando Sosa Perez",
    driver_id: "4ff53886-41cc-434f-ae23-a36a0e3ec8e2",
    amount_cents: 2700,
    voided_reimbursement_ids: ["507b804d-b964-4369-8789-6900f61d8c79"],
  },
  {
    settlement_display_id: "S-13645",
    driver_name: "Jorge Luis Infante Corona",
    driver_id: "3e138476-06db-4b08-9ebe-527a5d8c591d",
    amount_cents: 5000,
    voided_reimbursement_ids: ["7c2dffe8-5a72-4715-a4d8-70188563751b", "8dfa5aae-2b4f-4c0c-a220-aaacceb3a8a4"],
  },
  {
    settlement_display_id: "S-13648",
    driver_name: "Hugo Gaytan",
    driver_id: "3445cf68-4a7f-4d73-89f7-04bf1fd207b4",
    amount_cents: 4300,
    voided_reimbursement_ids: ["ef211f6c-6681-4074-95d5-ac034b315fca", "2a12ab33-fa90-4086-8438-575eb3afe06b"],
  },
  {
    settlement_display_id: "S-13643",
    driver_name: "Jose Antonio Vicente Martinez",
    driver_id: "45fac397-860e-4fe8-ae18-67e12e1959c1",
    amount_cents: 5244,
    voided_reimbursement_ids: ["ddff9437-d3b7-4a41-b7c8-5fda2f742a82", "dca86e56-ffac-4dca-835b-5d823e86b342"],
  },
];

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const dryRun = !apply || args.includes("--dry-run");
  if (apply && args.includes("--dry-run")) throw new Error("choose --dry-run or --apply, not both");
  if (apply && !LEAD_APPROVAL_QUOTE.trim()) {
    throw new Error("--apply refused: LEAD_APPROVAL_QUOTE is empty. Paste the owner's exact ✔ quote into this file first.");
  }

  console.log(`SET24-CORRECTION ${dryRun ? "DRY-RUN" : "APPLY"}: ${CORRECTIONS.length} correction row(s), pending (no settlement attached yet — each driver's actual next settlement will pick it up).`);
  let totalCents = 0;
  for (const c of CORRECTIONS) {
    totalCents += c.amount_cents;
    const reason = `SET-24 correction: reverses ${c.voided_reimbursement_ids.length} duplicate reimbursement(s) double-counted into ${c.settlement_display_id}'s net pay (voided ids: ${c.voided_reimbursement_ids.join(", ")})`;
    console.log(`  ${c.driver_name} (from ${c.settlement_display_id}) $${(c.amount_cents / 100).toFixed(2)} — "${reason}"`);
  }
  console.log(`TOTAL: $${(totalCents / 100).toFixed(2)}`);

  if (dryRun) return;

  for (const c of CORRECTIONS) {
    const reason = `SET-24 correction: reverses ${c.voided_reimbursement_ids.length} duplicate reimbursement(s) double-counted into ${c.settlement_display_id}'s net pay (voided ids: ${c.voided_reimbursement_ids.join(", ")})`;
    const created = await withCurrentUser(OWNER_USER_ID, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA_COMPANY_ID]);
      return createSettlementDeduction(client, {
        driverId: c.driver_id,
        operatingCompanyId: USMCA_COMPANY_ID,
        amountCents: c.amount_cents,
        reason,
        sourceType: "other",
        createdByUserId: OWNER_USER_ID,
      });
    });
    console.log(`CREATED pending deduction ${created.id} for ${c.driver_name} — $${(created.amount_cents / 100).toFixed(2)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
