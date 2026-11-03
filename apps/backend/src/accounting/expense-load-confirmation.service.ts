/**
 * expense-load-confirmation.service.ts — OWNER RULING 443.288 (10-23-2026): "when setting on a load an expense, the
 * dispatcher or closer whatever must confirm them. always."
 *
 * The rule itself lives in the database (trigger accounting.expense_load_confirmation_rule, 202616230700): every load a
 * machine sets is 'proposed'; a write becomes 'confirmed' ONLY inside a transaction that carries
 * app.expense_load_confirm_actor = the person. This module is the one place that sets it:
 *   - confirmExpenseLoadsInClientTx — THE confirm / change engine (Dispatcher, Closer, Owner): confirms the engine's
 *     proposal or moves the expense (and its statement-difference children) to the load the person picked, through
 *     the existing engines (fuel receipt carry / reclassify by load), then confirms — one audit row per expense;
 *   - withExpenseLoadConfirmedBy — for the writers where a PERSON chose the load (Settlement Creator post by the closer,
 *     expense relink, reclassify by load, the fuel assignment answer, an expense entered with its load).
 * A settlement cannot close while any expense on its loads is 'proposed' (proposedExpenseLoadsOnSettlement).
 */
import { appendCrudAudit } from "../audit/crud-audit.js";
import { ExpenseLoadConfirmRefused, withExpenseLoadConfirmedBy } from "./expense-load-confirm-actor.js";
import { carryFuelReceiptToLoad } from "../fuel/fuel-receipt-repoint.service.js";
import { moveExpenseDocumentToLoad, moveExpenseFamilyToLoad, moveFuelReceiptDocumentToLoad } from "./reclassify/reclassify.service.js";

type Db = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }> };

/** Dispatcher (Dispatch) or the Closer (Settlements Close: Accountant / Administrator / Manager) or the Owner. */
export const EXPENSE_LOAD_CONFIRM_ROLES = new Set(["Owner", "Administrator", "Manager", "Accountant", "Dispatcher"]);

// The one writer of the confirming actor + the named refusal live in expense-load-confirm-actor.ts (row 102: a machine
// actor is refused by name, MACHINE_CANNOT_CONFIRM_LOAD). Re-exported so every existing import keeps one class.
export { ExpenseLoadConfirmRefused, markExpenseLoadConfirmedBy, withExpenseLoadConfirmedBy, assertPersonConfirmsLoad } from "./expense-load-confirm-actor.js";

export type ExpenseLoadConfirmItem = { expenseId: string; loadId?: string | null };
export type ExpenseLoadConfirmResult = {
  confirmed: number; moved: number;
  rows: Array<{ expense_id: string; from_load_id: string | null; to_load_id: string; changed: boolean; children: number }>;
};

/**
 * THE confirm / change engine. Each item confirms the expense on its current (proposed) load, or — when `loadId`
 * differs — moves it there first (a fuel receipt through the receipt carry; any other expense by reclassify), its
 * statement-difference children following, then confirms the expense and its children. A child is refused: it
 * follows its receipt. Refuses (nothing changes) on a voided / unknown expense, no load, or a load of another company.
 */
export async function confirmExpenseLoadsInClientTx(
  client: Db,
  input: { operatingCompanyId: string; actorUserId: string; items: ExpenseLoadConfirmItem[]; reason?: string },
): Promise<ExpenseLoadConfirmResult> {
  if (!input.items.length) throw new ExpenseLoadConfirmRefused("NOTHING_TO_CONFIRM", "Select at least one expense.");
  const reason = (input.reason ?? "").trim() || "Expense load confirmed by a person (OWNER RULING 443.288)";
  const out: ExpenseLoadConfirmResult = { confirmed: 0, moved: 0, rows: [] };
  return withExpenseLoadConfirmedBy(client, input.actorUserId, async () => {
    for (const item of input.items) {
      const e = (await client.query<{ id: string; load_id: string | null; parent: string | null; fill: string | null; number: string | null }>(
        `SELECT id::text, load_id::text, parent_expense_id::text AS parent, source_fuel_transaction_id::text AS fill, expense_number AS number
           FROM accounting.expenses WHERE id = $1::uuid AND operating_company_id = $2::uuid AND voided_at IS NULL FOR UPDATE`,
        [item.expenseId, input.operatingCompanyId],
      )).rows[0];
      if (!e) throw new ExpenseLoadConfirmRefused("EXPENSE_NOT_FOUND", "That expense is not a live expense of this company.", { expense_id: item.expenseId });
      if (e.parent) {
        throw new ExpenseLoadConfirmRefused("CHILD_FOLLOWS_ITS_RECEIPT", "A statement card difference follows its receipt — confirm the receipt.", { expense_id: e.id, parent_expense_id: e.parent });
      }
      const target = item.loadId ?? e.load_id;
      if (!target) throw new ExpenseLoadConfirmRefused("NO_LOAD_TO_CONFIRM", "This expense has no load — pick the load to confirm it on.", { expense_id: e.id });
      const load = (await client.query<{ load_number: string | null }>(
        `SELECT load_number FROM mdata.loads WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [target, input.operatingCompanyId],
      )).rows[0];
      if (!load) throw new ExpenseLoadConfirmRefused("LOAD_NOT_IN_COMPANY", "That load is not a load of this company.", { load_id: target });
      const changed = target !== e.load_id;
      if (changed) {
        if (e.fill) {
          let carried = await carryFuelReceiptToLoad(client as never, {
            operatingCompanyId: input.operatingCompanyId, actorUserId: input.actorUserId, fillKind: "fuel_transaction",
            fillId: e.fill, toLoadId: target, toLoadNumber: load.load_number, reason,
          });
          // Row 102 (443.288 family): a Relay fill is posted under its Relay id (prod 11-03: 1,655 fuel_event legs, 0 under a
          // fuel row of a Relay fill). Carry it by the Relay id like the fill engine does, so its ledger AND every sibling
          // fuel row (diesel + DEF) move together — never only the one row the expense names.
          const relayId = carried === "not_posted"
            ? (await client.query<{ relay_id: string | null }>(
                `SELECT relay_fuel_transaction_id::text AS relay_id FROM fuel.fuel_transactions WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
                [e.fill, input.operatingCompanyId],
              )).rows[0]?.relay_id ?? null
            : null;
          if (relayId) {
            carried = await carryFuelReceiptToLoad(client as never, {
              operatingCompanyId: input.operatingCompanyId, actorUserId: input.actorUserId, fillKind: "relay_fuel",
              fillId: relayId, toLoadId: target, toLoadNumber: load.load_number, reason,
            });
          }
          if (carried === "split") throw new ExpenseLoadConfirmRefused("RECEIPT_SPLIT_ACROSS_LOADS", "This receipt's ledger is split across loads — reclassify it line by line.", { expense_id: e.id });
          if (carried === "not_posted") {
            // a settlement-entered receipt posts as its expense document: move that, then the fuel rows follow
            await moveExpenseDocumentToLoad(client as never, {
              operatingCompanyId: input.operatingCompanyId, actorUserId: input.actorUserId, expenseId: e.id, expenseNumber: e.number,
              fromLoadId: e.load_id, toLoadId: target, reason, auditEvent: "accounting.expense_load.changed_by_person",
            });
            await moveFuelReceiptDocumentToLoad(client as never, input.operatingCompanyId, { fillId: relayId ?? e.fill, loadId: target, actorUserId: input.actorUserId, reason });
          }
        } else {
          await moveExpenseDocumentToLoad(client as never, {
            operatingCompanyId: input.operatingCompanyId, actorUserId: input.actorUserId, expenseId: e.id, expenseNumber: e.number,
            fromLoadId: e.load_id, toLoadId: target, reason, auditEvent: "accounting.expense_load.changed_by_person",
          });
        }
        out.moved += 1;
      }
      // Row 102 (443.288 family): the receipt's children ALWAYS end on the load the person confirmed — also when the
      // receipt itself did not move (prod 11-03: 11 live children sat on another load than their confirmed receipt).
      // Idempotent: a child already on the load is skipped by the family move.
      await moveExpenseFamilyToLoad(client as never, {
        operatingCompanyId: input.operatingCompanyId, actorUserId: input.actorUserId, parentExpenseIds: [e.id], toLoadId: target, reason,
      });
      // confirm the expense and its children on the target (the trigger stamps who / when from the actor)
      const confirmed = await client.query<{ id: string }>(
        `UPDATE accounting.expenses SET load_confirmation = 'confirmed', updated_at = now()
          WHERE operating_company_id = $2::uuid AND voided_at IS NULL AND load_id = $3::uuid AND (id = $1::uuid OR parent_expense_id = $1::uuid)
          RETURNING id::text`,
        [e.id, input.operatingCompanyId, target],
      );
      if (!confirmed.rows.some((r) => r.id === e.id)) {
        throw new ExpenseLoadConfirmRefused("CONFIRM_RACED", "The expense moved while it was being confirmed — refresh and try again.", { expense_id: e.id });
      }
      const children = confirmed.rows.length - 1;
      await appendCrudAudit(client as never, input.actorUserId, changed ? "accounting.expense_load.changed_and_confirmed" : "accounting.expense_load.confirmed", {
        operating_company_id: input.operatingCompanyId, expense_id: e.id, from_load_id: e.load_id, to_load_id: target, children, reason,
      }, "info", "443.288-B");
      out.confirmed += 1;
      out.rows.push({ expense_id: e.id, from_load_id: e.load_id, to_load_id: target, changed, children });
    }
    return out;
  });
}

/** Live expenses on a settlement's loads that are still 'proposed' — a settlement cannot close while any exist. */
export async function proposedExpenseLoadsOnSettlement(
  client: Db,
  operatingCompanyId: string,
  settlementId: string,
): Promise<Array<{ expense_id: string; expense_number: string | null; load_id: string; total_cents: string }>> {
  return (await client.query<{ expense_id: string; expense_number: string | null; load_id: string; total_cents: string }>(
    `SELECT e.id::text AS expense_id, e.expense_number, e.load_id::text, e.total_amount_cents::text AS total_cents
       FROM accounting.expenses e
      WHERE e.operating_company_id = $1::uuid AND e.voided_at IS NULL AND e.load_confirmation = 'proposed'
        AND e.load_id IN (SELECT DISTINCT sl.load_id FROM driver_finance.settlement_lines sl
                           WHERE sl.settlement_id = $2::uuid AND sl.operating_company_id = $1::uuid
                             AND sl.is_active = true AND sl.voided_at IS NULL AND sl.load_id IS NOT NULL)
      ORDER BY e.load_id, e.expense_number`,
    [operatingCompanyId, settlementId],
  )).rows;
}

export function proposedExpenseLoadsMessage(rows: Array<{ expense_number: string | null }>): string {
  const names = rows.slice(0, 5).map((r) => r.expense_number ?? "an expense").join(", ");
  return `${rows.length} expense${rows.length === 1 ? "" : "s"} on this settlement's loads ${rows.length === 1 ? "is" : "are"} still proposed (${names}${rows.length > 5 ? ", …" : ""}) — confirm their load before closing (OWNER RULING 443.288).`;
}
