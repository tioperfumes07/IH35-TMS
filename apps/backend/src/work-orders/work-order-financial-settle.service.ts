// Work-order financial settlement on void / cancel — reverses the WO's linked bill / expense through void.service on the
// caller's transaction. Plain service: the governance void executor imports it from here, never from work-orders.routes.ts
// (an executor importing a route module drags the HTTP auth middleware and Lucia session provider in — CC-2 2026-10-04).
import { auditVoid, postVoidReversal, type VoidReversalResult } from "../accounting/void.service.js";
import { cascadeVoidChildren } from "../accounting/cascade-void-engine.service.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import { companyBusinessDate } from "../lib/company-business-date.js";

// ── WO VOID/CANCEL financial linkage (Tier-1, gated WO_VOID_ENABLED, default OFF) ─────────────────────
// A work order's only posted GL comes through its auto-created BILL: maintenance close posts via the
// posting engine with source_transaction_type='bill' (see accounting/maintenance-posting/poster.service.ts
// processMaintenanceWorkOrderClose), and the WO→bill link is accounting.bills.linked_work_order_uuid
// (migrations 0090 / 0123; written by two-section-service.autoCreateBillFromWO + the poster). Voiding or
// cancelling a WO that has posted financials WITHOUT reversing them would orphan those entries, so:
//   - flag OFF + WO has financial linkage  -> REFUSE (never orphan).
//   - flag ON  + WO has linked bill(s)/expense(s) -> reverse each one's GL via the SHARED void engine
//     (void.service.postVoidReversal, entityType 'bill'/'expense') + flip the source to status='void'
//     (canonical void columns) + auditVoid, all on the SAME transaction client (atomic). The cash-path
//     expense (accounting.expenses) is KEPT, not retired (Jorge 2026-06-29) — its linked WO reverses it.
// NO new GL math is written here — the equal-and-opposite reversing JE is produced entirely by
// void.service. The reversing JE id is surfaced back to the caller to persist into
// maintenance.work_orders.reversing_entry_ref.
export type WoFinancialSettleResult =
  | { kind: "ok"; reversing_entry_ref: string | null; closed_period_reversal: boolean }
  | { kind: "financial_blocked" }
  | { kind: "bill_has_payments" };

export type SettleClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

export async function columnPresent(client: SettleClient, schema: string, table: string, column: string): Promise<boolean> {
  const res = await client.query(
    `SELECT 1 AS ok FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3 LIMIT 1`,
    [schema, table, column]
  );
  return Boolean(res.rows[0]?.ok);
}

// Exported so the governance maker-checker executor (governance/void-cancel-executors.ts) reverses a
// WO's financials through the SAME money-safe path when an executor approves a void/cancel request.
export async function settleWorkOrderFinancialLinkage(
  client: SettleClient,
  operatingCompanyId: string,
  workOrderId: string,
  userId: string,
  reason: string
): Promise<WoFinancialSettleResult> {
  // PER-ENTITY gate (NOT a global process.env read): resolve WO_VOID_ENABLED via lib.feature_flags for
  // THIS operating company, so enabling WO-void for one entity cannot enable it for another. Default OFF.
  const woVoidEnabled = await isEnabled(client as never, "WO_VOID_ENABLED", { operating_company_id: operatingCompanyId });

  // WO → bill (the reliable, migration-backed linkage). Active = revoked_at IS NULL.
  const billsRes = await client.query(
    `SELECT id::text AS id, bill_date::text AS bill_date, COALESCE(display_id, bill_number) AS label
       FROM accounting.bills
      WHERE operating_company_id = $1::uuid
        AND linked_work_order_uuid = $2::uuid
        AND revoked_at IS NULL`,
    [operatingCompanyId, workOrderId]
  );
  const linkedBills = billsRes.rows.map((r) => ({
    id: String(r.id),
    bill_date: String(r.bill_date ?? ""),
    label: r.label ? String(r.label) : "(unnumbered)",
  }));
  const billIds = linkedBills.map((b) => b.id);

  // WO → expense linkage is migration-backed as of 202606290071 (accounting.expenses.linked_work_order_uuid).
  // Still detect it DEFENSIVELY (column-existence guarded) so a fresh/old DB without the column can't 42703;
  // when present + flag ON, a posted linked expense is REVERSED below via the same shared void engine.
  let linkedExpenseCount = 0;
  if (await columnPresent(client, "accounting", "expenses", "linked_work_order_uuid")) {
    const expRes = await client.query(
      `SELECT COUNT(*)::int AS n
         FROM accounting.expenses
        WHERE operating_company_id = $1::uuid
          AND linked_work_order_uuid = $2::uuid`,
      [operatingCompanyId, workOrderId]
    );
    linkedExpenseCount = Number(expRes.rows[0]?.n ?? 0);
  }

  // Posted GL = journal_entry_postings carrying the bill source linkage within a posting batch.
  const postedRes = await client.query(
    `SELECT COUNT(*)::int AS n
       FROM accounting.journal_entry_postings
      WHERE operating_company_id = $1::uuid
        AND posting_batch_id IS NOT NULL
        AND source_transaction_type = 'bill'
        AND source_transaction_id = ANY($2::text[])`,
    [operatingCompanyId, billIds]
  );
  const postedCount = Number(postedRes.rows[0]?.n ?? 0);

  const hasFinancialLinkage = linkedBills.length > 0 || linkedExpenseCount > 0 || postedCount > 0;
  if (!hasFinancialLinkage) {
    // Open/unposted WO (e.g. DEMO-WO-001/002) — pure status change, no money. Proceeds regardless of flag.
    return { kind: "ok", reversing_entry_ref: null, closed_period_reversal: false };
  }

  // Financial linkage present: gated. Default OFF refuses so we can NEVER orphan posted entries.
  if (!woVoidEnabled) return { kind: "financial_blocked" };

  // Mirror accounting.bills.service.voidBill: a bill with live payments cannot be voided.
  const payRes = await client.query(
    `SELECT COUNT(*)::int AS n
       FROM accounting.bill_payments
      WHERE operating_company_id = $1::uuid
        AND bill_id = ANY($2::uuid[])
        AND revoked_at IS NULL`,
    [operatingCompanyId, billIds]
  );
  if (Number(payRes.rows[0]?.n ?? 0) > 0) return { kind: "bill_has_payments" };

  // All reversals below run on THIS transaction client (the route's withCompanyScope BEGIN/COMMIT), so the
  // bill reversal + the expense reversal + the WO status flip are ALL-OR-NOTHING — a throw rolls back the
  // whole set, never leaving a half-reversed WO. NO new GL math: postVoidReversal builds every reversing JE.
  let reversingEntryRef: string | null = null;
  // Task #24: surface whether ANY reversal dated into a different (current) period — i.e. the source
  // touched a closed period. The reversal itself already dates into the open period (void.service); this
  // is only the register-facing flag.
  let closedPeriod = false;
  const today = companyBusinessDate();

  // LST-F416 (ROUND 390.3) — reversal memos name the work order and documents by their human numbers; the records
  // themselves are linked structurally (source_transaction_type/id on every reversal line), never by a raw id in prose.
  // Read only once a reversal is certain (after the linkage / flag / payments gates).
  const woRes = await client.query(
    `SELECT display_id FROM maintenance.work_orders WHERE operating_company_id = $1::uuid AND id = $2::uuid LIMIT 1`,
    [operatingCompanyId, workOrderId]
  );
  const woLabel = woRes.rows[0]?.display_id ? String(woRes.rows[0].display_id) : "(unnumbered)";

  // Reverse + void each linked bill.
  for (const bill of linkedBills) {
    // Guard an empty/short bill_date (COALESCE(null) -> '') so resolveReversalDate gets a real ISO date.
    const originalDate = bill.bill_date && bill.bill_date.length >= 10 ? bill.bill_date.slice(0, 10) : today;
    const reversal: VoidReversalResult = await postVoidReversal(
      client,
      {
        operatingCompanyId,
        entityType: "bill",
        entityId: bill.id,
        originalDate,
        memo: `Void reversal of bill ${bill.label} (work order ${woLabel} voided): ${reason}`,
      },
      { userId }
    );
    await client.query(
      `UPDATE accounting.bills
          SET status = 'void',
              revoked_at = now(),
              revoked_by_user_id = $3::uuid,
              revoked_reason = $4,
              updated_at = now()
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
          AND revoked_at IS NULL`,
      [bill.id, operatingCompanyId, userId, reason]
    );
    // ROUND 138 -- WO-close bill void is another independent writer of accounting.bills.
    await cascadeVoidChildren(client, "bill", bill.id, operatingCompanyId);
    await auditVoid(client, userId, "bill", { operatingCompanyId, entityId: bill.id, reason, reversal });
    if (reversal.reversal_journal_entry_id) reversingEntryRef = reversal.reversal_journal_entry_id;
    if (reversal.closed_period_reversal) closedPeriod = true;
  }

  // Reverse + void each linked EXPENSE (KEEP the cash path — Jorge 2026-06-29). Same bill grain: whole
  // expense = one net-zero reversing JE via the shared engine (entityType 'expense'). Unposted expenses
  // (no GL) just flip to void. Atomic with the bills above + the WO flip.
  if (linkedExpenseCount > 0) {
    const expRes = await client.query<{ id: string; transaction_date: string | null; expense_number: string | null }>(
      `SELECT id::text AS id, transaction_date::text AS transaction_date, expense_number
         FROM accounting.expenses
        WHERE operating_company_id = $1::uuid
          AND linked_work_order_uuid = $2::uuid
          AND status <> 'void'`,
      [operatingCompanyId, workOrderId]
    );
    for (const exp of expRes.rows) {
      const td = exp.transaction_date && exp.transaction_date.length >= 10 ? exp.transaction_date.slice(0, 10) : today;
      const reversal: VoidReversalResult = await postVoidReversal(
        client,
        {
          operatingCompanyId,
          entityType: "expense",
          entityId: exp.id,
          originalDate: td,
          memo: `Void reversal of expense ${exp.expense_number ?? "(unnumbered)"} (work order ${woLabel} voided): ${reason}`,
        },
        { userId }
      );
      await client.query(
        `UPDATE accounting.expenses
            SET status = 'void',
                posting_status = CASE WHEN posting_status = 'posted' THEN 'reversed' ELSE posting_status END,
                reversed_by_je_id = COALESCE($3::uuid, reversed_by_je_id),
                voided_at = now(),
                voided_by_user_id = $4::uuid,
                void_reason = $5,
                updated_at = now()
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
            AND status <> 'void'`,
        [exp.id, operatingCompanyId, reversal.reversal_journal_entry_id, userId, reason]
      );
      // ROUND 138 -- WO-close expense void is another independent writer of accounting.expenses.
      await cascadeVoidChildren(client, "expense", exp.id, operatingCompanyId);
      await auditVoid(client, userId, "expense", { operatingCompanyId, entityId: exp.id, reason, reversal });
      if (reversal.reversal_journal_entry_id) reversingEntryRef = reversal.reversal_journal_entry_id;
      if (reversal.closed_period_reversal) closedPeriod = true;
    }
  }

  return { kind: "ok", reversing_entry_ref: reversingEntryRef, closed_period_reversal: closedPeriod };
}
