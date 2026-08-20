// [HOLD-FOR-JORGE — TIER 1] Void/cancel executor DISPATCH MAP (governance maker-checker).
//
// When an executor APPROVES a governance.void_cancel_requests row, the underlying void/cancel must
// actually run — keyed on entity_type. This dispatch map is the single registry of WHICH entities can
// be executed from an approved request. Phase 1 wired entity_type='work_order' to the real WO
// void/cancel path (reusing settleWorkOrderFinancialLinkage — the SHARED, money-safe reversal that
// reverses the WO's linked bill/expense GL via void.service, NO new GL math), plus 'bill'/'invoice'
// (postVoidReversal). VOID-EVERYWHERE PR-3 (this block) wires the remaining Phase-2 financial surfaces:
// 'expense', 'journal_entry', 'payment' (customer payment), 'bill_payment', 'driver_settlement'. Every
// unwired entity is registered EXPLICITLY as { supported: false } so an approve can never silently
// no-op — it returns a clear "entity not yet wired" instead.
//
// Most work runs on the caller's transaction client (the approve route's withCompanyScope txn) so the
// reversal + every subledger/status flip + the request decision are atomic (all-or-nothing).

import { appendCrudAudit } from "../audit/crud-audit.js";
import { settleWorkOrderFinancialLinkage } from "../work-orders/work-orders.routes.js";
import { auditVoid, isVoidEnforcementEnabled, postVoidReversal } from "../accounting/void.service.js";
import { reverseJournalEntryNoFlip } from "../accounting/journal-entries.service.js";
import { companyBusinessDate } from "../lib/company-business-date.js";
import { reverseSettlementBillPaymentInClientTx } from "../accounting/settlement-posting/settlement-bill-payment-posting.service.js";
import { voidBillPaymentInClientTx } from "../accounting/bills.service.js";

export type VoidCancelAction = "void" | "cancel";

export type ExecutorContext = {
  client: { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };
  operatingCompanyId: string;
  entityId: string;
  action: VoidCancelAction;
  userId: string;
  reason: string;
};

export type ExecutorResult =
  | { kind: "ok"; reversing_entry_ref: string | null; closed_period_reversal?: boolean }
  | { kind: "unsupported_entity" } // entity_type registered { supported:false } OR its schema is absent
  | { kind: "not_found" }
  | { kind: "already_done" }
  | { kind: "not_completable" } // cancel attempted on a completed WO / paid invoice / paid settlement
  | { kind: "financial_blocked" } // posted financials + the surface's OFF posting flag -> never orphan
  | { kind: "bill_has_payments" }
  | { kind: "void_not_enabled" }; // surface requires VOID_ENFORCEMENT_ENABLED ON unconditionally (expense)

type EntityExecutor = (ctx: ExecutorContext) => Promise<ExecutorResult>;

/** Phase-1: the only fully-wired executor. Reuses the money-safe WO settle path on the SAME txn client. */
const executeWorkOrder: EntityExecutor = async (ctx) => {
  const { client, operatingCompanyId, entityId, action, userId, reason } = ctx;

  const ready = await client.query<{ ok: boolean }>(`SELECT to_regclass('maintenance.work_orders') IS NOT NULL AS ok`);
  if (!ready.rows[0]?.ok) return { kind: "unsupported_entity" };

  if (action === "void") {
    const pre = await client.query<{ voided_at: string | null }>(
      `SELECT voided_at FROM maintenance.work_orders
        WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1 FOR UPDATE`,
      [entityId, operatingCompanyId]
    );
    if (!pre.rows[0]) return { kind: "not_found" };
    if (pre.rows[0].voided_at) return { kind: "already_done" };

    // Reverse linked financials FIRST (gated WO_VOID_ENABLED; refuses when posted + flag OFF).
    const fin = await settleWorkOrderFinancialLinkage(client, operatingCompanyId, entityId, userId, reason);
    if (fin.kind === "financial_blocked") return { kind: "financial_blocked" };
    if (fin.kind === "bill_has_payments") return { kind: "bill_has_payments" };

    const res = await client.query<{ id: string; status: string }>(
      `UPDATE maintenance.work_orders
          SET voided_at = now(),
              voided_by_user_id = $2::uuid,
              void_notes = $3,
              void_reason_code = COALESCE(void_reason_code, 'manual'),
              reversing_entry_ref = COALESCE($5, reversing_entry_ref),
              updated_at = now()
        WHERE id = $1::uuid AND operating_company_id = $4::uuid AND voided_at IS NULL
        RETURNING id::text, status::text`,
      [entityId, userId, reason, operatingCompanyId, fin.reversing_entry_ref]
    );
    const wo = res.rows[0];
    if (!wo) return { kind: "already_done" };
    await appendCrudAudit(
      client,
      userId,
      "maintenance.work_order.voided",
      {
        resource_type: "maintenance.work_orders",
        resource_id: wo.id,
        entity_type: "work_order",
        entity_id: wo.id,
        operating_company_id: operatingCompanyId,
        status_at_void: wo.status,
        reason,
        reversing_entry_ref: fin.reversing_entry_ref,
        financial_void: fin.reversing_entry_ref != null,
        via: "governance.void_cancel_requests",
      },
      "warning",
      "VOID-CANCEL-GOV"
    );
    return { kind: "ok", reversing_entry_ref: fin.reversing_entry_ref, closed_period_reversal: fin.closed_period_reversal };
  }

  // action === "cancel"
  const pre = await client.query<{ status: string }>(
    `SELECT status::text AS status FROM maintenance.work_orders
      WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1 FOR UPDATE`,
    [entityId, operatingCompanyId]
  );
  if (!pre.rows[0]) return { kind: "not_found" };
  const priorStatus = String(pre.rows[0].status ?? "");
  if (priorStatus === "complete") return { kind: "not_completable" };
  if (priorStatus === "cancelled") return { kind: "already_done" };

  const fin = await settleWorkOrderFinancialLinkage(client, operatingCompanyId, entityId, userId, reason);
  if (fin.kind === "financial_blocked") return { kind: "financial_blocked" };
  if (fin.kind === "bill_has_payments") return { kind: "bill_has_payments" };

  const res = await client.query<{ id: string }>(
    `UPDATE maintenance.work_orders
        SET status = 'cancelled',
            cancelled_at = COALESCE(cancelled_at, now()),
            cancelled_by_user_id = COALESCE(cancelled_by_user_id, $2::uuid),
            cancellation_reason = COALESCE(cancellation_reason, $3),
            reversing_entry_ref = COALESCE($5, reversing_entry_ref),
            updated_at = now()
      WHERE id = $1::uuid AND operating_company_id = $4::uuid AND status <> 'complete'
      RETURNING id::text`,
    [entityId, userId, reason, operatingCompanyId, fin.reversing_entry_ref]
  );
  const wo = res.rows[0];
  if (!wo) return { kind: "not_found" };
  await appendCrudAudit(
    client,
    userId,
    "maintenance.work_order.cancelled",
    {
      resource_id: wo.id,
      entity_type: "work_order",
      entity_id: wo.id,
      reason,
      reversing_entry_ref: fin.reversing_entry_ref,
      financial_void: fin.reversing_entry_ref != null,
      operating_company_id: operatingCompanyId,
      via: "governance.void_cancel_requests",
    },
    "warning",
    "VOID-CANCEL-GOV"
  );
  return { kind: "ok", reversing_entry_ref: fin.reversing_entry_ref, closed_period_reversal: fin.closed_period_reversal };
};

// ── Shared surface-void gate (pure; unit-tested) ──────────────────────────────────────────────────────
// Mirrors the WO money-safe rule for the other financial surfaces:
//   - posted GL + surface flag OFF  -> 'blocked' (NEVER orphan posted entries).
//   - surface flag ON               -> 'reverse' (postVoidReversal builds the equal-and-opposite JE).
//   - no posted GL                  -> 'flip_only' (pure status change, no GL, regardless of flag).
export type SurfaceVoidGate = "reverse" | "flip_only" | "blocked";
export function resolveSurfaceVoidGate(flagOn: boolean, hasPostedFinancials: boolean): SurfaceVoidGate {
  if (hasPostedFinancials && !flagOn) return "blocked";
  if (flagOn) return "reverse";
  return "flip_only";
}

type ExecClient = ExecutorContext["client"];

/** Count posted GL lines carrying this entity's source linkage inside a posting batch. */
async function countPostedGl(
  client: ExecClient,
  operatingCompanyId: string,
  sourceType: "bill" | "invoice" | "expense" | "journal_entry" | "bill_payment" | "customer_payment",
  entityId: string
): Promise<number> {
  const res = await client.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n
       FROM accounting.journal_entry_postings
      WHERE operating_company_id = $1::uuid
        AND posting_batch_id IS NOT NULL
        AND source_transaction_type = $2
        AND source_transaction_id = $3`,
    [operatingCompanyId, sourceType, entityId]
  );
  return Number(res.rows[0]?.n ?? 0);
}

// Bill executor — reuses void.service.postVoidReversal (NO new GL math) behind VOID_ENFORCEMENT_ENABLED
// (per-entity). Mirrors accounting/bills.service.voidBill's guards (already-void, live-payments) so a
// governed void behaves identically to the direct route. TMS→QBO push is intentionally NOT enqueued here
// (the gated QBO mirror hook owns that; default OFF).
const executeBill: EntityExecutor = async (ctx) => {
  const { client, operatingCompanyId, entityId, userId, reason } = ctx;

  const ready = await client.query<{ ok: boolean }>(`SELECT to_regclass('accounting.bills') IS NOT NULL AS ok`);
  if (!ready.rows[0]?.ok) return { kind: "unsupported_entity" };

  const pre = await client.query<{ status: string; bill_date: string | null }>(
    `SELECT status::text AS status, bill_date::text AS bill_date
       FROM accounting.bills WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1 FOR UPDATE`,
    [entityId, operatingCompanyId]
  );
  if (!pre.rows[0]) return { kind: "not_found" };
  if (String(pre.rows[0].status) === "void") return { kind: "already_done" };

  const payRes = await client.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM accounting.bill_payments
      WHERE bill_id = $1::uuid AND operating_company_id = $2::uuid AND revoked_at IS NULL`,
    [entityId, operatingCompanyId]
  );
  if (Number(payRes.rows[0]?.n ?? 0) > 0) return { kind: "bill_has_payments" };

  const flagOn = await isVoidEnforcementEnabled(client, operatingCompanyId, userId);
  const postedCount = await countPostedGl(client, operatingCompanyId, "bill", entityId);
  const gate = resolveSurfaceVoidGate(flagOn, postedCount > 0);
  if (gate === "blocked") return { kind: "financial_blocked" };

  let reversingEntryRef: string | null = null;
  let closedPeriod = false;
  if (gate === "reverse") {
    const bd = pre.rows[0].bill_date;
    const originalDate = bd && bd.length >= 10 ? bd.slice(0, 10) : new Date().toISOString().slice(0, 10);
    const reversal = await postVoidReversal(
      client,
      { operatingCompanyId, entityType: "bill", entityId, originalDate, memo: `Void reversal of bill ${entityId}: ${reason}` },
      { userId }
    );
    reversingEntryRef = reversal.reversal_journal_entry_id;
    closedPeriod = reversal.closed_period_reversal;
    await auditVoid(client, userId, "bill", { operatingCompanyId, entityId, reason, reversal });
  }

  const flipped = await client.query<{ id: string }>(
    `UPDATE accounting.bills
        SET status = 'void', revoked_at = now(), revoked_by_user_id = $3::uuid, revoked_reason = $4, updated_at = now()
      WHERE id = $1::uuid AND operating_company_id = $2::uuid AND status <> 'void'
      RETURNING id::text`,
    [entityId, operatingCompanyId, userId, reason]
  );
  if (!flipped.rows[0]) return { kind: "already_done" };
  await appendCrudAudit(
    client,
    userId,
    "accounting.bill.voided",
    {
      resource_type: "accounting.bills",
      resource_id: entityId,
      operating_company_id: operatingCompanyId,
      reason,
      reversing_entry_ref: reversingEntryRef,
      financial_void: reversingEntryRef != null,
      via: "governance.void_cancel_requests",
    },
    "warning",
    "VOID-CANCEL-GOV"
  );
  return { kind: "ok", reversing_entry_ref: reversingEntryRef, closed_period_reversal: closedPeriod };
};

// Invoice executor — same money-safe pattern (reuses postVoidReversal behind VOID_ENFORCEMENT_ENABLED).
// Mirrors accounting/invoices.routes void guards: a PAID invoice cannot be voided; already-void is a no-op.
const executeInvoice: EntityExecutor = async (ctx) => {
  const { client, operatingCompanyId, entityId, userId, reason } = ctx;

  const ready = await client.query<{ ok: boolean }>(`SELECT to_regclass('accounting.invoices') IS NOT NULL AS ok`);
  if (!ready.rows[0]?.ok) return { kind: "unsupported_entity" };

  const pre = await client.query<{ status: string; issue_date: string | null }>(
    `SELECT status::text AS status, issue_date::text AS issue_date
       FROM accounting.invoices WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1 FOR UPDATE`,
    [entityId, operatingCompanyId]
  );
  if (!pre.rows[0]) return { kind: "not_found" };
  const status = String(pre.rows[0].status);
  if (status === "void") return { kind: "already_done" };
  if (status === "paid") return { kind: "not_completable" }; // paid invoice cannot be voided (mirror route)

  const flagOn = await isVoidEnforcementEnabled(client, operatingCompanyId, userId);
  const postedCount = await countPostedGl(client, operatingCompanyId, "invoice", entityId);
  const gate = resolveSurfaceVoidGate(flagOn, postedCount > 0);
  if (gate === "blocked") return { kind: "financial_blocked" };

  let reversingEntryRef: string | null = null;
  let closedPeriod = false;
  if (gate === "reverse") {
    const idt = pre.rows[0].issue_date;
    const originalDate = idt && idt.length >= 10 ? idt.slice(0, 10) : new Date().toISOString().slice(0, 10);
    const reversal = await postVoidReversal(
      client,
      { operatingCompanyId, entityType: "invoice", entityId, originalDate, memo: `Void reversal of invoice ${entityId}: ${reason}` },
      { userId }
    );
    reversingEntryRef = reversal.reversal_journal_entry_id;
    closedPeriod = reversal.closed_period_reversal;
    await auditVoid(client, userId, "invoice", { operatingCompanyId, entityId, reason, reversal });
  }

  const flipped = await client.query<{ id: string }>(
    `UPDATE accounting.invoices
        SET status = 'void', voided_at = now(), void_reason = $3, updated_by_user_id = $4::uuid, updated_at = now()
      WHERE id = $1::uuid AND operating_company_id = $2::uuid AND status <> 'void'
      RETURNING id::text`,
    [entityId, operatingCompanyId, reason, userId]
  );
  if (!flipped.rows[0]) return { kind: "already_done" };
  await appendCrudAudit(
    client,
    userId,
    "accounting.invoices.voided",
    {
      resource_type: "accounting.invoices",
      resource_id: entityId,
      operating_company_id: operatingCompanyId,
      reason,
      reversing_entry_ref: reversingEntryRef,
      financial_void: reversingEntryRef != null,
      via: "governance.void_cancel_requests",
    },
    "warning",
    "VOID-CANCEL-GOV"
  );
  return { kind: "ok", reversing_entry_ref: reversingEntryRef, closed_period_reversal: closedPeriod };
};

// VOID-EVERYWHERE PR-3 + GOV-JE-VOID-FIX — journal_entry executor. REVERSES-not-flips: it calls the SHARED
// reverseJournalEntryNoFlip helper (same mechanics as the direct journal-entries.service.ts voidJournalEntry)
// on ctx.client so it is atomic with the governance decision. The original is NEVER flipped to 'voided' (GL
// readers exclude 'voided', so a flip silently drops the original; the reversing JE nets the GL). NO new GL
// math. Gate stays VOID_ENFORCEMENT_ENABLED (R2 — per-surface, unchanged).
const executeJournalEntry: EntityExecutor = async (ctx) => {
  const { client, operatingCompanyId, entityId, userId, reason } = ctx;

  const ready = await client.query<{ ok: boolean }>(`SELECT to_regclass('accounting.journal_entries') IS NOT NULL AS ok`);
  if (!ready.rows[0]?.ok) return { kind: "unsupported_entity" };

  const pre = await client.query<{ status: string }>(
    `SELECT status::text AS status
       FROM accounting.journal_entries WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1 FOR UPDATE`,
    [entityId, operatingCompanyId]
  );
  if (!pre.rows[0]) return { kind: "not_found" };
  // Reverse-not-flip means the original stays 'posted' after a successful reversal — so a legacy 'voided'
  // row is the only "already done" reachable from status alone; an already-REVERSED (still-posted) original
  // is caught by the helper's double-reversal guard below. A non-posted (draft) JE cannot be reversed.
  if (String(pre.rows[0].status) === "voided") return { kind: "already_done" };
  if (String(pre.rows[0].status) !== "posted") return { kind: "not_completable" };

  // GOV-JE-VOID-FIX (owner ruling): compute posted GL from the JE's OWN postings (journal_entry_uuid) — a
  // directly-created JE links its postings that way and does NOT carry source_transaction_type='journal_entry',
  // so countPostedGl() would read 0 and wrongly yield flip_only. A JE ALWAYS carries balanced GL, so a plain
  // status flip is never safe: flag OFF -> blocked, flag ON -> reverse; flip_only is unreachable for a real JE.
  const glCount = await client.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM accounting.journal_entry_postings
       WHERE operating_company_id = $1::uuid AND journal_entry_uuid = $2::uuid`,
    [operatingCompanyId, entityId]
  );
  const flagOn = await isVoidEnforcementEnabled(client, operatingCompanyId, userId);
  const gate = resolveSurfaceVoidGate(flagOn, Number(glCount.rows[0]?.n ?? 0) > 0);
  // Anything that is not a reversal is BLOCKED for a JE (never silently drop it via a status flip; a zero-GL
  // JE has nothing to drop but is defaulted to blocked per the owner ruling — no silent no-op, no flip).
  if (gate !== "reverse") return { kind: "financial_blocked" };

  let reversal;
  try {
    reversal = (await reverseJournalEntryNoFlip(client, { operatingCompanyId, journalEntryId: entityId, reason, actorUserId: userId })).reversal;
  } catch (err) {
    const msg = String((err as Error)?.message ?? "");
    if (msg === "journal_entry_already_reversed") return { kind: "already_done" };
    if (msg === "journal_entry_not_postable") return { kind: "not_completable" };
    if (msg === "journal_entry_not_found") return { kind: "not_found" };
    throw err; // unexpected — surface it, never swallow (no fake success)
  }

  await auditVoid(client, userId, "journal_entry", { operatingCompanyId, entityId, reason, reversal });
  await appendCrudAudit(
    client,
    userId,
    "accounting.journal_entries.reversed",
    {
      resource_type: "accounting.journal_entries",
      resource_id: entityId,
      operating_company_id: operatingCompanyId,
      reason,
      reversing_entry_ref: reversal.reversal_journal_entry_id,
      financial_void: true,
      reverses_not_flips: true, // original stays status='posted'; the reversing JE nets the GL
      via: "governance.void_cancel_requests",
    },
    "warning",
    "VOID-CANCEL-GOV"
  );
  return { kind: "ok", reversing_entry_ref: reversal.reversal_journal_entry_id, closed_period_reversal: reversal.closed_period_reversal };
};

// VOID-EVERYWHERE PR-3 — expense executor. expenses.routes.ts' direct /void route requires
// VOID_ENFORCEMENT_ENABLED unconditionally (no Owner-only flip-only fallback like bill/invoice/JE) —
// mirrored here as `void_not_enabled` rather than silently allowing a plain status flip. When the flag
// is on, reuses postVoidReversal (entityType 'expense' — same generic source-linked path already used
// by the WO executor to reverse a linked posted expense) instead of the direct route's separate-
// transaction reversePostedSourceTransaction call, so the reversal + status flip land atomically here.
const executeExpense: EntityExecutor = async (ctx) => {
  const { client, operatingCompanyId, entityId, userId, reason } = ctx;

  const ready = await client.query<{ ok: boolean }>(`SELECT to_regclass('accounting.expenses') IS NOT NULL AS ok`);
  if (!ready.rows[0]?.ok) return { kind: "unsupported_entity" };

  const pre = await client.query<{ status: string; posting_status: string; transaction_date: string | null }>(
    `SELECT status::text AS status, posting_status::text AS posting_status, transaction_date::text AS transaction_date
       FROM accounting.expenses WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1 FOR UPDATE`,
    [entityId, operatingCompanyId]
  );
  if (!pre.rows[0]) return { kind: "not_found" };
  if (String(pre.rows[0].status) === "void" || String(pre.rows[0].posting_status) === "reversed") return { kind: "already_done" };

  const flagOn = await isVoidEnforcementEnabled(client, operatingCompanyId, userId);
  if (!flagOn) return { kind: "void_not_enabled" };

  let reversingEntryRef: string | null = null;
  if (String(pre.rows[0].posting_status) === "posted") {
    const td = pre.rows[0].transaction_date;
    const originalDate = td && td.length >= 10 ? td.slice(0, 10) : new Date().toISOString().slice(0, 10);
    const reversal = await postVoidReversal(
      client,
      { operatingCompanyId, entityType: "expense", entityId, originalDate, memo: `Void reversal of expense ${entityId}: ${reason}` },
      { userId }
    );
    reversingEntryRef = reversal.reversal_journal_entry_id;
    await auditVoid(client, userId, "expense", { operatingCompanyId, entityId, reason, reversal });
  }

  const flipped = await client.query<{ id: string }>(
    `UPDATE accounting.expenses
        SET status = 'void',
            posting_status = CASE WHEN posting_status = 'posted' THEN 'reversed' ELSE posting_status END,
            reversed_by_je_id = COALESCE($3::uuid, reversed_by_je_id),
            voided_at = now(), voided_by_user_id = $4::uuid, void_reason = $5, updated_at = now()
      WHERE id = $1::uuid AND operating_company_id = $2::uuid AND status <> 'void'
      RETURNING id::text`,
    [entityId, operatingCompanyId, reversingEntryRef, userId, reason]
  );
  if (!flipped.rows[0]) return { kind: "already_done" };
  await appendCrudAudit(
    client,
    userId,
    "expense.voided",
    {
      expense_id: entityId,
      operating_company_id: operatingCompanyId,
      reason,
      reversing_journal_entry_id: reversingEntryRef,
      via: "governance.void_cancel_requests",
    },
    "warning",
    "VOID-CANCEL-GOV"
  );
  return { kind: "ok", reversing_entry_ref: reversingEntryRef };
};

// VOID-EVERYWHERE PR-3 — bill_payment executor. Mirrors bills.service.ts voidBillPayment's guards
// (not-found / already-voided), reverses any posted GL for this bill_payment via postVoidReversal
// (entityType 'bill_payment' — additive VoidableEntityType, same generic source-linked path), THEN
// reuses the EXISTING voidBillPaymentInClientTx for the status flip + bill paid_cents recompute +
// bank-balance restore (bank-balance math must never be duplicated — reuse the live function
// verbatim).
//
// ACCT-F5637 — this used to call the voidBillPayment() WRAPPER instead of the ...InClientTx variant.
// That wrapper opens its OWN pool connection (withCurrentUser) and immediately runs its own
// SELECT ... FOR UPDATE on the SAME accounting.bill_payments row ctx.client's own SELECT ... FOR
// UPDATE above already holds, uncommitted, for the duration of this request. The second connection's
// lock request blocks waiting for the first connection's transaction to commit; the first connection
// is synchronously awaiting the second connection's promise to resolve before it can commit — an
// application-level self-deadlock across two DB sessions that Postgres's own deadlock detector cannot
// see (there is no DB-visible wait-for cycle; connection A simply never finishes). Prod has
// statement_timeout=0/lock_timeout=0, so the blocked query hangs indefinitely rather than erroring,
// permanently pinning two pool connections per stuck attempt. Fixed by calling
// voidBillPaymentInClientTx DIRECTLY on ctx.client (the same atomic pattern executeDriverSettlement
// below already uses for its own bill-payment/bill reversal calls) with reversePostedGl explicitly
// false, since the postVoidReversal call above already performed the GL reversal for this request —
// letting voidBillPaymentInClientTx's own naive hasPostedBatch check run again would risk a second,
// redundant reversing JE (it cannot distinguish an original posting from the reversal postVoidReversal
// just inserted, both tagged with the same source_transaction_type/id by design).
const executeBillPayment: EntityExecutor = async (ctx) => {
  const { client, operatingCompanyId, entityId, userId, reason } = ctx;

  const ready = await client.query<{ ok: boolean }>(`SELECT to_regclass('accounting.bill_payments') IS NOT NULL AS ok`);
  if (!ready.rows[0]?.ok) return { kind: "unsupported_entity" };

  const pre = await client.query<{ status: string; revoked_at: string | null; payment_date: string | null }>(
    `SELECT status::text AS status, revoked_at::text AS revoked_at, payment_date::text AS payment_date
       FROM accounting.bill_payments WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1 FOR UPDATE`,
    [entityId, operatingCompanyId]
  );
  if (!pre.rows[0]) return { kind: "not_found" };
  if (pre.rows[0].revoked_at || String(pre.rows[0].status) === "void") return { kind: "already_done" };

  const flagOn = await isVoidEnforcementEnabled(client, operatingCompanyId, userId);
  const postedCount = await countPostedGl(client, operatingCompanyId, "bill_payment", entityId);
  const gate = resolveSurfaceVoidGate(flagOn, postedCount > 0);
  if (gate === "blocked") return { kind: "financial_blocked" };

  let reversingEntryRef: string | null = null;
  let closedPeriod = false;
  if (gate === "reverse") {
    const pd = pre.rows[0].payment_date;
    const originalDate = pd && pd.length >= 10 ? pd.slice(0, 10) : new Date().toISOString().slice(0, 10);
    const reversal = await postVoidReversal(
      client,
      { operatingCompanyId, entityType: "bill_payment", entityId, originalDate, memo: `Void reversal of bill payment ${entityId}: ${reason}` },
      { userId }
    );
    reversingEntryRef = reversal.reversal_journal_entry_id;
    closedPeriod = reversal.closed_period_reversal;
    await auditVoid(client, userId, "bill_payment", { operatingCompanyId, entityId, reason, reversal });
  }

  // Reuse the LIVE status-flip / paid_cents-recompute / bank-balance-restore function verbatim — never
  // re-derive money math. Runs on ctx.client (see header comment — ACCT-F5637).
  await voidBillPaymentInClientTx(client, {
    operatingCompanyId,
    paymentId: entityId,
    reason,
    userId,
    reversePostedGl: false,
    currentBusinessDate: companyBusinessDate(),
  });

  await appendCrudAudit(
    client,
    userId,
    "accounting.bill_payment.voided",
    {
      resource_type: "accounting.bill_payments",
      resource_id: entityId,
      operating_company_id: operatingCompanyId,
      reason,
      reversing_entry_ref: reversingEntryRef,
      financial_void: reversingEntryRef != null,
      via: "governance.void_cancel_requests",
    },
    "warning",
    "VOID-CANCEL-GOV"
  );
  return { kind: "ok", reversing_entry_ref: reversingEntryRef, closed_period_reversal: closedPeriod };
};

// VOID-EVERYWHERE PR-3 — customer payment executor (governance entity_type 'payment'). Mirrors
// accounting/payments.routes.ts' direct /void route (voided_at guard, payment_applications unapply —
// void-never-delete). Reverses posted GL (source_transaction_type='customer_payment', written by
// accounting/payments/apply.service.ts) via postVoidReversal before the status flip, atomic on ctx.client.
const executeCustomerPayment: EntityExecutor = async (ctx) => {
  const { client, operatingCompanyId, entityId, userId, reason } = ctx;

  const ready = await client.query<{ ok: boolean }>(`SELECT to_regclass('accounting.payments') IS NOT NULL AS ok`);
  if (!ready.rows[0]?.ok) return { kind: "unsupported_entity" };

  const pre = await client.query<{ voided_at: string | null; payment_date: string | null }>(
    `SELECT voided_at::text AS voided_at, payment_date::text AS payment_date
       FROM accounting.payments WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1 FOR UPDATE`,
    [entityId, operatingCompanyId]
  );
  if (!pre.rows[0]) return { kind: "not_found" };
  if (pre.rows[0].voided_at) return { kind: "already_done" };

  const flagOn = await isVoidEnforcementEnabled(client, operatingCompanyId, userId);
  const postedCount = await countPostedGl(client, operatingCompanyId, "customer_payment", entityId);
  const gate = resolveSurfaceVoidGate(flagOn, postedCount > 0);
  if (gate === "blocked") return { kind: "financial_blocked" };

  let reversingEntryRef: string | null = null;
  let closedPeriod = false;
  if (gate === "reverse") {
    const pd = pre.rows[0].payment_date;
    const originalDate = pd && pd.length >= 10 ? pd.slice(0, 10) : new Date().toISOString().slice(0, 10);
    const reversal = await postVoidReversal(
      client,
      { operatingCompanyId, entityType: "customer_payment", entityId, originalDate, memo: `Void reversal of payment ${entityId}: ${reason}` },
      { userId }
    );
    reversingEntryRef = reversal.reversal_journal_entry_id;
    closedPeriod = reversal.closed_period_reversal;
    await auditVoid(client, userId, "customer_payment", { operatingCompanyId, entityId, reason, reversal });
  }

  await client.query(
    `UPDATE accounting.payments SET voided_at = now(), voided_by_user_id = $2::uuid, void_reason = $3 WHERE id = $1::uuid`,
    [entityId, userId, reason]
  );
  // INV-2: void-never-delete — archive all applications when voiding; never hard-delete.
  await client.query(
    `UPDATE accounting.payment_applications SET unapplied_at = now(), unapplied_by_user_id = $2 WHERE payment_id = $1 AND unapplied_at IS NULL`,
    [entityId, userId]
  );

  await appendCrudAudit(
    client,
    userId,
    "accounting.payment_voided",
    {
      resource_type: "accounting.payments",
      resource_id: entityId,
      operating_company_id: operatingCompanyId,
      void_reason: reason,
      reversing_entry_ref: reversingEntryRef,
      financial_void: reversingEntryRef != null,
      via: "governance.void_cancel_requests",
    },
    "warning",
    "VOID-CANCEL-GOV"
  );
  return { kind: "ok", reversing_entry_ref: reversingEntryRef, closed_period_reversal: closedPeriod };
};

// Driver-settlement cancellation runs every GL, payment, bill, bank, deduction, driver-bill, settlement,
// and audit leg on the caller's transaction client. One company business date is captured here and passed
// through every reversal leg; any failure aborts the complete user-visible cancellation.
const executeDriverSettlement: EntityExecutor = async (ctx) => {
  const { client, operatingCompanyId, entityId, userId, reason } = ctx;

  const ready = await client.query<{ ok: boolean }>(`SELECT to_regclass('driver_finance.driver_settlements') IS NOT NULL AS ok`);
  if (!ready.rows[0]?.ok) return { kind: "unsupported_entity" };

  const pre = await client.query<{ status: string }>(
    `SELECT status::text AS status FROM driver_finance.driver_settlements
      WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1 FOR UPDATE`,
    [entityId, operatingCompanyId]
  );
  if (!pre.rows[0]) return { kind: "not_found" };
  const status = String(pre.rows[0].status);
  if (status === "cancelled") return { kind: "already_done" };
  if (status === "paid") return { kind: "not_completable" }; // already paid out to the driver — cannot reverse via this path

  const currentBusinessDate = companyBusinessDate();
  const reversal = await reverseSettlementBillPaymentInClientTx(
    client,
    { operatingCompanyId, settlementId: entityId, reason },
    { userId },
    currentBusinessDate
  );

  const flipped = await client.query<{ id: string }>(
    `UPDATE driver_finance.driver_settlements
        SET status = 'cancelled',
            reversed_at = now(),
            reversed_by_user_id = $3::uuid,
            reversal_reason = $4,
            updated_at = now()
      WHERE id = $1::uuid AND operating_company_id = $2::uuid AND status <> 'cancelled'
      RETURNING id::text`,
    [entityId, operatingCompanyId, userId, reason]
  );
  if (!flipped.rows[0]) return { kind: "already_done" };

  await appendCrudAudit(
    client,
    userId,
    "driver_finance.driver_settlement.voided",
    {
      resource_type: "driver_finance.driver_settlements",
      resource_id: entityId,
      operating_company_id: operatingCompanyId,
      reason,
      gl_reversal_result: reversal.result,
      gl_run_id: reversal.run_id,
      via: "governance.void_cancel_requests",
    },
    "warning",
    "VOID-CANCEL-GOV"
  );
  return { kind: "ok", reversing_entry_ref: reversal.run_id };
};

// Dispatch map keyed on entity_type. Phase 1 wired 'work_order'; VOID-EVERYWHERE PR-3 wires the
// remaining Phase-2 financial surfaces flagged in the prior report: expense, journal_entry, payment,
// bill_payment, driver_settlement. 'load' is deliberately LEFT unsupported here — dispatch load
// cancellation already has its OWN dedicated maker/checker workflow
// (dispatch/cancellation.service.ts::cancelLoad / approveCancellation, with its own per-entity
// catalogs.load_cancellation_reasons) per the explicit design decision in migration
// 202606300030_void_cancel_reasons_catalog.sql ("load cancellations stay on the per-entity
// catalogs.load_cancellation_reasons — separate operational domain, NOT the financial void catalog").
// Routing 'load' through THIS governance layer too would create two parallel approval systems for the
// same action — flagged as a drift/decision point for Jorge rather than silently rearchitected here.
const EXECUTORS: Record<string, EntityExecutor | { supported: false }> = {
  work_order: executeWorkOrder,
  // Task #24: bill + invoice wired through the SHARED void engine (postVoidReversal), gated per-entity
  // by VOID_ENFORCEMENT_ENABLED (default OFF). No new GL math — same reversal path as the direct routes.
  bill: executeBill,
  invoice: executeInvoice,
  // VOID-EVERYWHERE PR-3 (this block): all wired through the SAME shared engine.
  expense: executeExpense,
  journal_entry: executeJournalEntry,
  payment: executeCustomerPayment,
  bill_payment: executeBillPayment,
  driver_settlement: executeDriverSettlement,
  // Deliberately unsupported — see comment above.
  load: { supported: false },
};

/** Is this entity_type fully wired for governed execution today (Phase 1)? */
export function isVoidCancelEntitySupported(entityType: string): boolean {
  const entry = EXECUTORS[entityType];
  return typeof entry === "function";
}

/** Known entity types in the dispatch map (wired or explicitly registered-unsupported). */
export function knownVoidCancelEntities(): string[] {
  return Object.keys(EXECUTORS);
}

/**
 * Execute the void/cancel for an approved request. Returns { kind:'unsupported_entity' } when the
 * entity_type is unknown OR registered { supported:false } — the approve route surfaces that as a
 * clear "entity not yet wired" so nothing is silently no-op'd.
 */
export async function executeVoidCancel(entityType: string, ctx: ExecutorContext): Promise<ExecutorResult> {
  const entry = EXECUTORS[entityType];
  if (typeof entry !== "function") return { kind: "unsupported_entity" };
  return entry(ctx);
}
