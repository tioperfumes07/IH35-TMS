// ROUND 394 RULING 2 — a driver receivable (accident damage / civil fine / internal fine liability, posted at
// creation as Dr 1255 / 1256) is written off ONLY by a reversing entry, never by zeroing a stored balance.
//
// writeOffDriverReceivableInClientTx, inside the caller's transaction:
//   1. not a posted receivable type            -> { kind: "not_receivable" } (caller keeps its own path);
//   2. any part already recovered through settlement (a linked deduction collected cents, derived from
//      v_settlement_deduction_balances)          -> { kind: "recovered" } — refuse: reversing the whole entry
//      would over-credit the receivable; the collected part is real money (owner decision per case);
//   3. otherwise void the receivable's still-pending linked deductions (so nothing recovers a written-off
//      debt later) and reverse its 'driver_liability' posting through the canonical poster
//                                                 -> { kind: "reversed", journal_entry_id }.
import { reversePostedSourceTransactionInClientTx } from "../accounting/posting-engine.service.js";
import { todayIso } from "../accounting/void.service.js";
import { voidSettlementDeduction } from "./settlement-deduction-void.service.js";
import { driverReceivableFor } from "./driver-receivable-roles.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type DriverReceivableWriteOff =
  | { kind: "not_receivable" }
  | { kind: "recovered"; recovered_cents: number }
  | { kind: "reversed"; journal_entry_id: string; voided_deduction_ids: string[] };

export async function writeOffDriverReceivableInClientTx(
  client: DbClient,
  input: { operatingCompanyId: string; liabilityId: string; actorUserId: string; reason: string }
): Promise<DriverReceivableWriteOff> {
  const liab = await client.query<{ type: string }>(
    `SELECT type FROM driver_finance.driver_liabilities WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
    [input.liabilityId, input.operatingCompanyId]
  );
  if (!driverReceivableFor(liab.rows[0]?.type)) return { kind: "not_receivable" };

  const deductions = await client.query<{ id: string; collected_cents: string }>(
    `
      SELECT d.id::text,
             (d.amount_cents - COALESCE((SELECT v.remaining_cents FROM driver_finance.v_settlement_deduction_balances v
                                          WHERE v.deduction_id = d.id), d.amount_cents))::text AS collected_cents
        FROM driver_finance.driver_settlement_deductions d
       WHERE d.operating_company_id = $1::uuid
         AND d.liability_id = $2::uuid
         AND d.voided_at IS NULL
       FOR UPDATE OF d
    `,
    [input.operatingCompanyId, input.liabilityId]
  );
  const recovered = deductions.rows.reduce((n, r) => n + Math.max(0, Number(r.collected_cents ?? 0)), 0);
  if (recovered > 0) return { kind: "recovered", recovered_cents: recovered };

  const voided: string[] = [];
  for (const d of deductions.rows) {
    await voidSettlementDeduction(client as never, {
      operating_company_id: input.operatingCompanyId,
      deduction_id: d.id,
      reason: `Driver receivable written off: ${input.reason}`,
      actor_user_id: input.actorUserId,
    });
    voided.push(d.id);
  }

  const reversal = await reversePostedSourceTransactionInClientTx(
    client as never,
    { operating_company_id: input.operatingCompanyId, source_transaction_type: "driver_liability", source_transaction_id: input.liabilityId },
    { userId: input.actorUserId },
    todayIso()
  );
  return { kind: "reversed", journal_entry_id: reversal.journal_entry_id, voided_deduction_ids: voided };
}
