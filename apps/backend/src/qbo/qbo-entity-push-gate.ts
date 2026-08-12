import { isEnabled } from "../lib/feature-flags/service.js";

// IMPORT-P0b — the SINGLE source of truth for whether TMS may push an ENTITY (invoice / bill / customer /
// vendor / account / item) INTO QuickBooks. Mirrors the JE kill-switch (IMPORT-P0,
// accounting/qbo-je-push-gate.ts). Under the parallel-books architecture (docs/specs/ACCOUNTING-ARCHITECTURE.md)
// the QBO connection is reconcile-only: outbound writes are OFF everywhere. All six
// outbox `tms.*-push.handler.ts` handlers consult this gate in deliver() BEFORE any QBO token fetch.
//
// Two layers, evaluated in order:
//   LAYER 2 (structural, flag-independent): a QBO-origin / cloned row must NEVER round-trip back into QBO.
//   LAYER 1 (per-entity kill-switch): QBO_ENTITY_PUSH_ENABLED (default OFF, per-entity-only) — push only ON.

export const QBO_ENTITY_PUSH_FLAG = "QBO_ENTITY_PUSH_ENABLED";
// Same string as the JE gate — an imported/cloned row round-tripping into QBO would corrupt the book of record.
export const QBO_PUSH_REFUSED_IMPORT_SOURCE = "qbo_push_refused_import_source";

export type EntityKind = "invoice" | "bill" | "customer" | "vendor" | "account" | "item";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

// Per-kind origin resolution. Two signal types:
//  - `source_system`  (invoice/bill): a real column, values 'tms' | 'qbo'. Exact.
//  - `qbo_id`         (customer/vendor/account/item): masterdata has no explicit origin column yet, so we
//    use qbo-id-presence as an APPROXIMATE, FAIL-CLOSED signal — a row with a qbo id is treated as
//    QBO-origin (refused). This over-refuses a TMS-created row that was already synced once, which is SAFE
//    under no-write-back (the flag is OFF anyway). The exact fix is an explicit origin/source column, which
//    MD-1/MD-2 MUST add (contract, stated in the PR). Until then LAYER-1 (default OFF) is the operative gate.
const ORIGIN_MAP: Record<
  EntityKind,
  { table: string; idCol: string; signalCol: string; kind: "source_system" | "qbo_id" }
> = {
  invoice: { table: "accounting.invoices", idCol: "id", signalCol: "source_system", kind: "source_system" },
  bill: { table: "accounting.bills", idCol: "id", signalCol: "source_system", kind: "source_system" },
  customer: { table: "mdata.customers", idCol: "id", signalCol: "qbo_customer_id", kind: "qbo_id" },
  vendor: { table: "mdata.vendors", idCol: "id", signalCol: "qbo_vendor_id", kind: "qbo_id" },
  account: { table: "catalogs.accounts", idCol: "id", signalCol: "qbo_account_id", kind: "qbo_id" },
  item: { table: "catalogs.items", idCol: "id", signalCol: "qbo_item_id", kind: "qbo_id" },
};

/** Resolve a row's origin: 'tms' (created in TMS) or 'qbo' (cloned/QBO-origin). Returns 'qbo' fail-closed
 *  when the row is missing or the signal can't be read — a row we cannot prove is TMS-origin is not pushed. */
export async function resolveEntityOrigin(
  client: Queryable,
  entityKind: EntityKind,
  operatingCompanyId: string,
  entityId: string
): Promise<"tms" | "qbo"> {
  const m = ORIGIN_MAP[entityKind];
  const res = await client.query<{ signal: string | null }>(
    `SELECT ${m.signalCol} AS signal FROM ${m.table} WHERE ${m.idCol} = $1 AND operating_company_id = $2::uuid LIMIT 1`,
    [entityId, operatingCompanyId]
  );
  if (res.rows.length === 0) return "qbo"; // unknown → fail closed (do not push)
  const signal = res.rows[0]?.signal ?? null;
  if (m.kind === "source_system") {
    return signal === "tms" ? "tms" : "qbo"; // any non-'tms' source is QBO-origin
  }
  // qbo_id kind: a set qbo id = QBO-origin (approximate, fail-closed).
  return signal !== null && String(signal).trim() !== "" ? "qbo" : "tms";
}

/** LAYER-1-only check (the operative kill-switch): is the per-entity push flag ON for this company?
 *  Used at the CHOKE POINTS that don't carry a clean per-row origin signal — the masterdata delivery
 *  function (schedulers + the qbo.master_entity handler all funnel through it) and the vendor-linkage
 *  create path. With the flag default OFF, these paths make ZERO QBO calls unless the owner enables the
 *  entity per company. (LAYER-2 origin refusal stays at the outbox handlers, where the origin is clean.) */
export async function isEntityPushEnabled(client: Queryable, operatingCompanyId: string): Promise<boolean> {
  return isEnabled(client, QBO_ENTITY_PUSH_FLAG, { operating_company_id: operatingCompanyId });
}

export type EntityPushDecision =
  | { decision: "allow"; origin: "tms" | "qbo" }
  | { decision: "flag_off"; origin: "tms" | "qbo" }
  | { decision: "import_source"; origin: "tms" | "qbo" };

/**
 * Decide whether an entity may be pushed to QuickBooks. The caller MUST have set app.operating_company_id
 * (and any bypass) on `client` so the origin read + flag read run in the right tenant context.
 */
export async function evaluateEntityPushGate(
  client: Queryable,
  params: { operatingCompanyId: string; entityKind: EntityKind; entityId: string }
): Promise<EntityPushDecision> {
  const origin = await resolveEntityOrigin(client, params.entityKind, params.operatingCompanyId, params.entityId);

  // LAYER 2 — QBO-origin / cloned rows never round-trip, even when the flag is ON.
  if (origin !== "tms") return { decision: "import_source", origin };

  // LAYER 1 — per-entity kill-switch (default OFF; global default/rollout can never enable it — the key is
  // enrolled in POSTING_FLAG_KEYS).
  const enabled = await isEnabled(client, QBO_ENTITY_PUSH_FLAG, { operating_company_id: params.operatingCompanyId });
  if (!enabled) return { decision: "flag_off", origin };

  return { decision: "allow", origin };
}
