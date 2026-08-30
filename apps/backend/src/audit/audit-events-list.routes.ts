import { setScopedCompanyContext } from "../_helpers/scoped-company-context.js";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export type ListAuditEventsInput = {
  operating_company_id: string;
  audit_event_id?: string;
  bulk_call_id?: string;
  from?: string;
  to?: string;
  limit: number;
  offset: number;
  entity_type?: string;
  entity_id?: string;
  actor?: string;
  // LV-AUDIT-HISTORY-STATUS-SOURCE-SINGLE-SELECT: these were single-value exact/ILIKE filters — a
  // QuickBooks-style single picker can only isolate one status/source/type at a time. Now accepted
  // as arrays (OR'd together) so the frontend's checkbox multi-select can filter on several at once.
  event_type?: string[];
  status?: string[];
  source?: string[];
  voids_only?: boolean;
};

type AuditEventListRow = {
  id: string;
  created_at: string;
  event_type: string;
  severity: string;
  summary: string;
  actor_user_id: string | null;
  actor_email: string | null;
  payload: unknown;
  source: string | null;
  bulk_call_id: string | null;
  total_count: number;
};

// LV-AUDIT-HISTORY-STATUS-SOURCE-SINGLE-SELECT: query params stay comma-separated strings (simplest
// wire format for a GET query param) and are transformed into arrays for the multi-value filters.
const commaListSchema = (max: number) =>
  z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => {
      if (!v) return undefined;
      const parts = v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, max);
      return parts.length > 0 ? parts : undefined;
    });

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
  audit_event_id: z.string().uuid().optional(),
  bulk_call_id: z.string().uuid().optional(),
  event_type: commaListSchema(20),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  entity_type: z.string().trim().min(1).max(100).optional(),
  entity_id: z.string().uuid().optional(),
  actor: z.string().trim().min(1).max(300).optional(),
  status: commaListSchema(20),
  source: commaListSchema(20),
  voids_only: z.enum(["true", "false"]).optional().transform((v) => v === "true"),
});

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit)) return 100;
  return Math.min(500, Math.max(1, Math.floor(limit)));
}

function normalizeOffset(offset: number): number {
  if (!Number.isFinite(offset)) return 0;
  return Math.max(0, Math.floor(offset));
}

function summarizePayload(eventClass: string, payload: unknown): string {
  if (!payload || typeof payload !== "object") return eventClass;
  const record = payload as Record<string, unknown>;
  const changes = record.changes;
  if (changes && typeof changes === "object") {
    const keys = Object.keys(changes as Record<string, unknown>);
    if (keys.length > 0) return `${eventClass}: ${keys.slice(0, 4).join(", ")}`;
  }
  if (typeof record.summary === "string" && record.summary.trim()) return record.summary.trim();
  if (typeof record.reason === "string" && record.reason.trim()) return record.reason.trim();
  return eventClass;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// VEND-F-AUDIT-HISTORY-TAB-ALWAYS-EMPTY: EntityAuditHistoryTab.tsx callers pass a short, singular
// `entityType` (e.g. "vendor") that this route matches against `payload->>'entity_type'`. But the
// large majority of CRUD writers (appendCrudAudit call sites in mdata/vendors.routes.ts,
// customers.routes.ts, drivers.routes.ts, units.routes.ts, fleet/trailer.routes.ts,
// maintenance/work-orders.routes.ts, dispatch load writers, etc. — confirmed by repo-wide grep:
// 682 `resource_type:` payload writes vs 226 `entity_type:` writes) tag their payload
// `resource_type`/`resource_id` instead, using a dotted schema.table string
// ("mdata.vendors", not "vendor"). Since the two naming conventions never matched, EVERY
// entity-detail "Audit History" tab whose backing CRUD writer uses resource_type — which is
// most of them — showed a permanent, indistinguishable-from-honest "No audit events found" even
// though real rows exist. This is the resource_type equivalent for entity-detail audit history of
// the entity_id-vs-actor_user_uuid mismatch already fixed for the User Activity tab above
// (AUDIT-ACTOR-FILTER-NULL-COMPANY-EVENTS-INVISIBLE) — same bug shape, different field pair.
//
// Map every EntityAuditHistoryTab caller's `entityType` value to the resource_type string(s) its
// real CRUD writer(s) actually use, so the filter can OR-match either naming convention without
// requiring a rewrite of every existing writer. Additive only — extend this map when a new
// EntityAuditHistoryTab caller is added; never remove an existing mapping.
const ENTITY_TYPE_TO_RESOURCE_TYPES: Record<string, string[]> = {
  vendor: ["mdata.vendors"],
  customer: ["mdata.customers"],
  driver: ["mdata.drivers"],
  equipment: ["mdata.equipment"],
  unit: ["mdata.units"],
  work_order: ["maintenance.work_orders"],
  load: ["mdata.loads"],
};

export function buildAuditEventsListQuery(input: ListAuditEventsInput): { sql: string; values: unknown[] } {
  const values: unknown[] = [input.operating_company_id];
  // AUDIT-ACTOR-FILTER-NULL-COMPANY-EVENTS-INVISIBLE — base company filter is built below, once the
  // actor block (if any) has had a chance to record its exact-uuid parameter position. See the
  // comment attached to that assembly for why.
  const filters: string[] = [];
  let actorExactUuidParamIndex: number | undefined;

  if (input.audit_event_id) {
    values.push(input.audit_event_id);
    filters.push(`e.uuid = $${values.length}::uuid`);
  }

  if (input.bulk_call_id) {
    values.push(input.bulk_call_id);
    filters.push(`e.payload->>'bulk_call_id' = $${values.length}`);
  }
  if (input.event_type && input.event_type.length > 0) {
    values.push(input.event_type.map((v) => `%${v}%`));
    filters.push(`e.event_class ILIKE ANY($${values.length}::text[])`);
  }
  if (input.entity_type) {
    values.push(input.entity_type);
    const entityTypeParam = values.length;
    const resourceTypeCandidates = ENTITY_TYPE_TO_RESOURCE_TYPES[input.entity_type];
    if (resourceTypeCandidates && resourceTypeCandidates.length > 0) {
      values.push(resourceTypeCandidates);
      filters.push(
        `(e.payload->>'entity_type' = $${entityTypeParam} OR e.payload->>'resource_type' = ANY($${values.length}::text[]))`
      );
    } else {
      filters.push(`e.payload->>'entity_type' = $${entityTypeParam}`);
    }
  }
  if (input.entity_id) {
    values.push(input.entity_id);
    filters.push(`(e.payload->>'entity_id' = $${values.length} OR e.payload->>'resource_id' = $${values.length})`);
  }
  if (input.actor) {
    // USER-ACTIVITY-AUDIT-REVERSE-FALSE-EMPTY — this used ONE wildcard-wrapped parameter
    // (`%${input.actor}%`) for BOTH branches: `u.email ILIKE $n` (correct — a partial email
    // search needs the wildcards) and `e.actor_user_uuid::text = $n` (wrong — `=` is exact
    // equality, so a value literally containing `%` characters can never equal a bare UUID
    // string). Every caller that passes a user's own uuid as `actor` (e.g. the User detail
    // page's own Activity tab, which is the ONLY caller that ever does) always missed 100% of
    // that user's real audit_events rows, rendering an indistinguishable-from-honest "No audit
    // activity found for this user" — live-reproduced: a real Owner account with `mcastillo@`
    // logged in and 2 real audit.audit_events rows for their exact actor_user_uuid showed zero
    // rows in the UI. Two separate parameters now serve each branch's own comparison operator.
    values.push(`%${input.actor}%`, input.actor);
    filters.push(`(u.email ILIKE $${values.length - 1} OR e.actor_user_uuid::text = $${values.length})`);
    // AUDIT-ACTOR-FILTER-NULL-COMPANY-EVENTS-INVISIBLE — only remember this as the exact-uuid param
    // when input.actor is genuinely a uuid (never for a partial email-search string); the base
    // company predicate below uses this to admit company-agnostic rows, but ONLY for this one
    // already-identified actor — never for an absent or free-text actor filter, so no other caller
    // of this shared endpoint gains cross-company visibility.
    if (UUID_RE.test(input.actor)) actorExactUuidParamIndex = values.length;
  }
  if (input.status && input.status.length > 0) {
    values.push(input.status);
    filters.push(`e.payload->>'status' = ANY($${values.length}::text[])`);
  }
  if (input.source && input.source.length > 0) {
    values.push(input.source);
    filters.push(`e.source = ANY($${values.length}::text[])`);
  }
  if (input.voids_only) {
    filters.push(`(e.event_class ILIKE '%void%' OR e.event_class ILIKE '%reverse%' OR e.event_class ILIKE '%delete%')`);
  }
  if (input.from) {
    values.push(input.from);
    filters.push(`e.created_at >= $${values.length}::timestamptz`);
  }
  if (input.to) {
    values.push(input.to);
    filters.push(`e.created_at <= $${values.length}::timestamptz`);
  }

  // VEND-AUDIT-HISTORY-TAB-FALSE-EMPTY-NULL-COMPANY-PAYLOAD — same shape as the actor-uuid widening
  // above, for EntityAuditHistoryTab (vendor/customer/driver/equipment/unit/work_order/load). Those
  // callers pass entity_type+entity_id, never actor, so actorExactUuidParamIndex is always
  // undefined for them and the base filter's unconditional `= $1::uuid` silently excluded every
  // row whose CRUD writer never stamped payload.operating_company_id (confirmed: mdata.vendors'
  // appendCrudAudit call sites don't) — live-reproduced on a real vendor with a real, just-created
  // audit.audit_events row that the vendor's own Audit History tab showed as "No audit events
  // found for this record." Widen ONLY when the caller supplied BOTH entity_type AND entity_id —
  // i.e. already narrowed to one specific, known entity (mirroring the actor-uuid exactness
  // requirement) — so a query with no entity filter (or only one of the two) never gains
  // visibility into another company's NULL-company rows. The entity_type/entity_id filters pushed
  // above already re-narrow these rows to the exact record; this only removes the company
  // predicate's own false exclusion of them.
  const entityExactMatchPresent = Boolean(input.entity_type && input.entity_id);
  filters.unshift(
    actorExactUuidParamIndex
      ? `((e.payload->>'operating_company_id')::uuid = $1::uuid OR ((e.payload->>'operating_company_id') IS NULL AND e.actor_user_uuid::text = $${actorExactUuidParamIndex}))`
      : entityExactMatchPresent
        ? `((e.payload->>'operating_company_id')::uuid = $1::uuid OR (e.payload->>'operating_company_id') IS NULL)`
        : `(e.payload->>'operating_company_id')::uuid = $1::uuid`
  );

  values.push(normalizeLimit(input.limit));
  const limitPos = values.length;
  values.push(normalizeOffset(input.offset));
  const offsetPos = values.length;

  return {
    sql: `
      SELECT
        e.uuid::text AS id,
        e.created_at::text AS created_at,
        e.event_class AS event_type,
        e.severity AS severity,
        e.payload AS payload,
        e.actor_user_uuid::text AS actor_user_id,
        u.email AS actor_email,
        e.source AS source,
        e.payload->>'bulk_call_id' AS bulk_call_id,
        count(*) OVER()::int AS total_count
      FROM audit.audit_events e
      LEFT JOIN identity.users u ON u.id = e.actor_user_uuid
      WHERE ${filters.join(" AND ")}
      ORDER BY e.created_at DESC, e.uuid DESC
      LIMIT $${limitPos}
      OFFSET $${offsetPos}
    `,
    values,
  };
}

export async function listAuditEvents(userId: string, input: ListAuditEventsInput) {
  return withCurrentUser(userId, async (client) => {
    await setScopedCompanyContext(client, userId, input.operating_company_id);
    const query = buildAuditEventsListQuery(input);
    const res = await (client as Queryable).query<AuditEventListRow>(query.sql, query.values);
    const events = res.rows.map((row) => ({
      id: row.id,
      created_at: row.created_at,
      event_type: row.event_type,
      severity: row.severity,
      summary: summarizePayload(row.event_type, row.payload),
      actor_user_id: row.actor_user_id,
      actor_email: row.actor_email,
      payload: row.payload,
      source: row.source,
      bulk_call_id: row.bulk_call_id,
    }));
    return {
      events,
      total_count: Number(res.rows[0]?.total_count ?? 0),
      limit: normalizeLimit(input.limit),
      offset: normalizeOffset(input.offset),
    };
  });
}

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  const role = String(req.user?.role ?? "");
  if (!["Owner", "Administrator", "Manager", "Accountant"].includes(role)) {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return req.user!;
}

export async function registerAuditEventsListRoutes(app: FastifyInstance) {
  app.get("/api/v1/audit/events-list", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;

    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    }

    return listAuditEvents(user.uuid, parsed.data);
  });
}
