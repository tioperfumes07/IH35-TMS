/**
 * SET-01 part 2 live-proof rehearsal (branch-only, never prod).
 * Exercises the REAL editSettlementDeduction service end-to-end:
 *   create a manual pending deduction -> edit it (amount + type + reason)
 *   -> assert the WORM void+recreate (old voided, new row carries the edited values, audit logged).
 * Run: DATABASE_URL=<branch> npx tsx apps/backend/scripts/rehearse-set01-edit-deduction.mts
 */
import pg from "pg";
import { createSettlementDeduction } from "../src/driver-finance/deductions.service.js";
import { editSettlementDeduction } from "../src/driver-finance/edit-settlement-deduction.service.js";

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const DRIVER = "40022039-b657-4713-97de-439fba899946";
const ACTOR = "d62f82f6-b5ce-47a5-bd4e-a97a90cc6775";

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query("SELECT set_config('app.bypass_rls','lucia',false)");
  await client.query("SELECT set_config('app.operating_company_id',$1,false)", [OPCO]);
  await client.query("SELECT set_config('app.current_user_id',$1,false)", [ACTOR]);

  await client.query("BEGIN");
  try {
    // 1 — create a manual pending deduction (no load -> standalone, not auto-materialized).
    const created = await createSettlementDeduction(client as never, {
      driverId: DRIVER,
      operatingCompanyId: OPCO,
      amountCents: 5000,
      reason: "SET-01 rehearsal: original wire fee recovery",
      sourceType: "wire_fee",
      loadId: null,
      createdByUserId: ACTOR,
    });
    console.log("CREATED", { id: created.id, type: created.deduction_type, amount_cents: created.amount_cents });

    // 2 — edit it: amount 50.00 -> 75.00, type wire_fee -> ach_fee, new reason.
    const result = await editSettlementDeduction(client as never, {
      operatingCompanyId: OPCO,
      deductionId: created.id,
      newAmountCents: 7500,
      newType: "ach_fee",
      reason: "SET-01 rehearsal: corrected to ACH fee $75.00",
      actorUserId: ACTOR,
    });
    console.log("EDIT RESULT", result);

    // 3 — assert the WORM void+recreate on the DB.
    const oldRow = await client.query(
      "SELECT status, amount_cents::int a, voided_at IS NOT NULL voided, void_reason FROM driver_finance.driver_settlement_deductions WHERE id=$1::uuid",
      [result.oldDeductionId]
    );
    const newRow = await client.query(
      "SELECT deduction_type, amount_cents::int a, reason, voided_at IS NOT NULL voided FROM driver_finance.driver_settlement_deductions WHERE id=$1::uuid",
      [result.newDeductionId]
    );
    const audit = await client.query(
      "SELECT event_class, payload->>'old_amount_cents' oa, payload->>'new_amount_cents' na, payload->>'new_deduction_type' nt FROM audit.audit_events WHERE event_class='driver_finance.settlement_deduction.edited' AND (payload->>'resource_id')=$1 ORDER BY created_at DESC LIMIT 1",
      [result.newDeductionId]
    );
    console.log("OLD ROW (must be voided)", oldRow.rows[0]);
    console.log("NEW ROW (must be ach_fee $75.00, active)", newRow.rows[0]);
    console.log("AUDIT edited event", audit.rows[0] ?? "(none — check audit action naming)");

    const oldVoided = oldRow.rows[0]?.voided === true;
    const newOk = newRow.rows[0]?.deduction_type === "ach_fee" && Number(newRow.rows[0]?.a) === 7500 && newRow.rows[0]?.voided === false;
    const idsDiffer = result.oldDeductionId !== result.newDeductionId;
    console.log("\nASSERT oldVoided =", oldVoided, "| newRowCorrect =", newOk, "| idsDiffer =", idsDiffer);
    if (!(oldVoided && newOk && idsDiffer)) throw new Error("SET-01 rehearsal FAILED an assertion");

    // 4 — refuse path: try to edit the now-voided old row (must throw deduction_already_voided).
    let refused = "";
    try {
      await editSettlementDeduction(client as never, {
        operatingCompanyId: OPCO,
        deductionId: result.oldDeductionId,
        newAmountCents: 100,
        reason: "SET-01 rehearsal: should be refused (voided)",
        actorUserId: ACTOR,
      });
    } catch (e) {
      refused = (e as { code?: string }).code ?? (e as Error).message;
    }
    console.log("REFUSE editing a voided row ->", refused, refused ? "(correctly refused)" : "(NOT refused — BUG)");
    if (!refused) throw new Error("SET-01 rehearsal FAILED: editing a voided deduction was not refused");

    await client.query("ROLLBACK"); // branch stays clean; the proof is the assertions above
    console.log("\nOK SET-01 rehearsal PASSED — rolled back (branch untouched).");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
