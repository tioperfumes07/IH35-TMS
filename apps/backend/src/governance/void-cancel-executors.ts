// [HOLD-FOR-JORGE — TIER 1] Void/cancel executor DISPATCH MAP (governance maker-checker).
//
// When an executor APPROVES a governance.void_cancel_requests row, the underlying void/cancel must
// actually run — keyed on entity_type. This dispatch map is the single registry of WHICH entities can
// be executed from an approved request. Phase 1 wires entity_type='work_order' to the real WO
// void/cancel path (reusing settleWorkOrderFinancialLinkage — the SHARED, money-safe reversal that
// reverses the WO's linked bill/expense GL via void.service, NO new GL math). Every other entity is
// registered EXPLICITLY as { supported: false } so an approve can never silently no-op an unwired
// surface — it returns a clear "entity not yet wired" instead.
//
// All work runs on the caller's transaction client (the approve route's withCompanyScope txn) so the
// reversal + the WO status flip + the request decision are atomic (all-or-nothing).

import { appendCrudAudit } from "../audit/crud-audit.js";
import { settleWorkOrderFinancialLinkage } from "../work-orders/work-orders.routes.js";

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
  | { kind: "ok"; reversing_entry_ref: string | null }
  | { kind: "unsupported_entity" } // entity_type registered { supported:false } OR its schema is absent
  | { kind: "not_found" }
  | { kind: "already_done" }
  | { kind: "not_completable" } // cancel attempted on a completed WO
  | { kind: "financial_blocked" } // posted financials + WO_VOID_ENABLED OFF -> never orphan
  | { kind: "bill_has_payments" };

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
    return { kind: "ok", reversing_entry_ref: fin.reversing_entry_ref };
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
      reason,
      reversing_entry_ref: fin.reversing_entry_ref,
      financial_void: fin.reversing_entry_ref != null,
      operating_company_id: operatingCompanyId,
      via: "governance.void_cancel_requests",
    },
    "warning",
    "VOID-CANCEL-GOV"
  );
  return { kind: "ok", reversing_entry_ref: fin.reversing_entry_ref };
};

// Dispatch map keyed on entity_type. Phase 1 wires 'work_order'; the rest are registered EXPLICITLY as
// unsupported so an approve fails loud ("entity not yet wired") rather than silently no-op. See the
// Phase-2 wiring backlog in the PR/report for the remaining ~39 surfaces.
const EXECUTORS: Record<string, EntityExecutor | { supported: false }> = {
  work_order: executeWorkOrder,
  invoice: { supported: false },
  bill: { supported: false },
  expense: { supported: false },
  journal_entry: { supported: false },
  payment: { supported: false },
  bill_payment: { supported: false },
  driver_settlement: { supported: false },
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
