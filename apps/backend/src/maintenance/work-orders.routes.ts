import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { reassignDraftAttachments } from "../documents/attachments.service.js";
import { processMaintenanceWorkOrderClose } from "../accounting/maintenance-posting/poster.service.js";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import {
  allocateInHouseFromWO,
  autoCreateBillFromWO,
  autoCreateExpenseFromWO,
  createWorkOrderWithLines,
} from "./two-section-service.js";
import { openWorkOrderPredicate } from "../kpi/canonical-kpis.js";
import { assertRoadsideFields, listWorkOrdersByBucket } from "./work-orders.service.js";
import { emitMaintenanceSpineEvent } from "./maintenance-spine-emit.js";
import { isWoInvoiceMismatch, validateWoVendorInvoiceTotals } from "./wo-cost-validation.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { enqueueOutboxEvent } from "../outbox/enqueue-outbox-event.js";

const workOrderStatusSchema = z.enum(["open", "in_progress", "waiting_parts", "complete", "cancelled"]);
const workOrderTypeSchema = z.enum(["pm", "repair", "tire", "accident"]);
const paymentTimingSchema = z.enum(["in_house", "paid_same_day", "vendor_invoice"]);

const listQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.string().optional(),
  wo_type: z.string().optional(),
  source_type: z.string().optional(),
  external_vendor_id: z.string().uuid().optional(),
  equipment_id: z.string().uuid().optional(),
  search: z.string().trim().max(120).optional(),
  // Service/Location drill-through: filter the WO list by service location + bucket so the tab's
  // row → /maintenance/active-wos?location=…&bucket=… resolves to real rows (no dead link).
  location: z.string().trim().max(200).optional(),
  bucket: z.enum(["in_house", "external", "roadside"]).optional(),
  // LOAD-WO-REVERSE: `maintenance.work_orders.load_id` has always been written (G18 requires every
  // diesel/roadside expense to FK a load) but nothing could ASK for a load's work orders, so the
  // dispatch drawer had no way to show them and a trip with two repairs on it looked clean.
  load_id: z.string().uuid().optional(),
  // DRV-LINK-WO-REVERSE: work_orders.driver_id is written on create; list must accept driver_id
  // so DriverDetail can reverse-drill (same pattern as load_id).
  driver_id: z.string().uuid().optional(),
});

const listByBucketQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const idParamsSchema = z.object({ id: z.string().uuid() });
const lineItemParamsSchema = z.object({ id: z.string().uuid(), lid: z.string().uuid() });

const createWorkOrderSchema = z.object({
  operating_company_id: z.string().uuid(),
  wo_type: workOrderTypeSchema,
  source_type: z.enum(["IS", "ES", "AC", "ET", "RT", "IT", "RS"]),
  status: workOrderStatusSchema.default("open"),
  unit_id: z.string().uuid(),
  equipment_id: z.string().uuid().optional(),
  driver_id: z.string().uuid().optional(),
  load_id: z.string().uuid().optional(),
  service_date: z.string().optional(),
  repair_location: z.string().default("in_house"),
  bucket: z.enum(["in_house", "external", "roadside"]).default("in_house"),
  vendor_id: z.string().uuid().optional(),
  vendor_invoice_number: z.string().trim().max(120).optional(),
  external_vendor_id: z.string().uuid().optional(),
  external_vendor_wo_number: z.string().trim().max(120).optional(),
  external_vendor_invoice_number: z.string().trim().max(120).optional(),
  description: z.string().trim().max(2000),
  severity: z.string().optional(),
  payment_timing: paymentTimingSchema.default("vendor_invoice"),
  bill_terms: z.string().optional(),
  bill_date: z.string().optional(),
  due_date: z.string().optional(),
  line_items: z.array(
    z.object({
      line_type: z.enum(["parts", "labor", "other"]),
      description: z.string().trim().max(500),
      quantity: z.number().min(0),
      unit_cost: z.number().min(0),
      amount: z.number().min(0),
    })
  ).default([]),
  roadside_callout_at: z.string().datetime({ offset: true }).optional(),
  roadside_arrived_at: z.string().datetime({ offset: true }).optional(),
  roadside_provider_vendor_id: z.string().uuid().optional(),
  roadside_location: z.string().trim().max(1000).optional(),
  roadside_breakdown_load_id: z.string().uuid().optional(),
  // Block 8 (migration 202606221100) — VMRS repair detail (additive; persisted post-insert in the service).
  vmrs_system_code: z.string().trim().max(40).optional(),
  vmrs_assembly_code: z.string().trim().max(40).optional(),
  vmrs_component_code: z.string().trim().max(40).optional(),
  out_of_service: z.boolean().optional(),
  repair_complaint: z.string().trim().max(2000).optional(),
  repair_cause: z.string().trim().max(2000).optional(),
  repair_correction: z.string().trim().max(2000).optional(),
});

const sectionALineSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: z.number().min(0).default(1),
  amount: z.number().min(0),
  expense_category_uuid: z.string().uuid(),
});

const sectionBSubRowSchema = z.object({
  line_type: z.enum(["parts", "labor"]),
  description: z.string().trim().min(1).max(500),
  quantity: z.number().min(0),
  unit_cost: z.number().min(0),
  amount: z.number().min(0),
  part_uuid: z.string().uuid().optional(),
  labor_rate_uuid: z.string().uuid().optional(),
  part_location_codes: z.array(z.string()).optional(),
});

const sectionBLineSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: z.number().min(0).default(1),
  unit_cost: z.number().min(0),
  amount: z.number().min(0),
  // Nullable by schema: permit an honestly described cost line when the service-item catalog is
  // degraded. The linkage can be completed later without losing the operational WO/cost record.
  service_item_uuid: z.string().uuid().optional().nullable(),
  sub_rows: z.array(sectionBSubRowSchema).default([]),
});

const createWorkOrderV5Schema = z.object({
  header: z.object({
    operating_company_id: z.string().uuid(),
    // Draft id used by UploadZone for create-time WO attachments; reconciled onto the real WO id in the
    // same txn (Option B — this is the endpoint the Create WO modal actually hits, unlike /api/v1/work-orders).
    attachment_draft_id: z.string().uuid().optional().nullable(),
    wo_type: workOrderTypeSchema,
    source_type: z.enum(["IS", "ES", "AC", "ET", "RT", "IT", "RS"]),
    status: workOrderStatusSchema.default("open"),
    unit_id: z.string().uuid(),
    equipment_id: z.string().uuid().optional(),
    driver_id: z.string().uuid().optional(),
    load_id: z.string().uuid().optional(),
    source_intransit_issue_id: z.string().uuid().optional(),
    load_exemption_reason: z.string().trim().min(20).optional(),
    service_date: z.string().optional(),
    repair_location: z.string().default("in_house"),
    bucket: z.enum(["in_house", "external", "roadside"]).default("in_house"),
    vendor_id: z.string().uuid().optional(),
    vendor_qbo_id: z.string().trim().max(120).optional(),
    shop_name: z.string().trim().max(200).optional(),
    shop_address: z.string().trim().max(400).optional(),
    shop_phone: z.string().trim().max(80).optional(),
    vendor_invoice_number: z.string().trim().max(120).optional(),
    external_vendor_id: z.string().uuid().optional(),
    external_vendor_wo_number: z.string().trim().max(120).optional(),
    external_vendor_invoice_number: z.string().trim().max(120).optional(),
    description: z.string().trim().max(2000),
    severity: z.string().optional(),
    payment_timing: paymentTimingSchema.default("vendor_invoice"),
    bill_terms: z.string().optional(),
    bill_date: z.string().optional(),
    due_date: z.string().optional(),
    payment_account_uuid: z.string().uuid().optional(),
    roadside_callout_at: z.string().datetime({ offset: true }).optional(),
    roadside_arrived_at: z.string().datetime({ offset: true }).optional(),
    roadside_provider_vendor_id: z.string().uuid().optional(),
    roadside_location: z.string().trim().max(1000).optional(),
    roadside_breakdown_load_id: z.string().uuid().optional(),
    // Block 8 (migration 202606221100) — VMRS repair detail (persisted post-insert in the service).
    vmrs_system_code: z.string().trim().max(40).optional(),
    vmrs_assembly_code: z.string().trim().max(40).optional(),
    vmrs_component_code: z.string().trim().max(40).optional(),
    out_of_service: z.boolean().optional(),
    repair_complaint: z.string().trim().max(2000).optional(),
    repair_cause: z.string().trim().max(2000).optional(),
    repair_correction: z.string().trim().max(2000).optional(),
    // render-v5 header (migration 202606221200 #1353) — persisted post-insert in the service.
    opened_at: z.string().datetime({ offset: true }).optional(),
    closed_at: z.string().datetime({ offset: true }).optional(), // W-FIX-8: § A Close date/time → closed_at
    authorized_by_user_id: z.string().uuid().optional(),
    authorization_number: z.string().trim().max(120).optional(),
    service_location_type: z.enum(["shop", "mobile", "roadside"]).optional(),
    repaired_by: z.enum(["in_house", "outside_vendor"]).optional(),
    // render-v5 §A Priority — stored value must match the mig-0310 CHECK (routine|urgent|immediate).
    wo_priority: z.enum(["routine", "urgent", "immediate"]).optional(),
    // C9 (HOLD migration 202609180000)
    customer_id: z.string().uuid().optional(),
    tax_rate_pct: z.number().min(0).max(100).optional(),
  }),
  sectionA: z.array(sectionALineSchema).default([]),
  sectionB: z.array(sectionBLineSchema).default([]),
  // Block 8 — asset-location map: serialized parts placed on the unit (tire/battery/lamp/mirror + serial + position).
  serialized_parts: z
    .array(
      z.object({
        part_type: z.enum(["tire", "battery", "lamp", "mirror", "other"]),
        part_label: z.string().trim().min(1).max(200),
        serial_number: z.string().trim().max(120).optional(),
        position_code: z.string().trim().max(60).optional(),
        unit_id: z.string().uuid().optional(),
        notes: z.string().trim().max(1000).optional(),
      })
    )
    .default([]),
});

const updateWorkOrderSchema = z.object({
  external_vendor_id: z.string().uuid().nullable().optional(),
  external_vendor_wo_number: z.string().trim().max(120).nullable().optional(),
  external_vendor_invoice_number: z.string().trim().max(120).nullable().optional(),
  description: z.string().trim().max(2000).optional(),
  bucket: z.enum(["in_house", "external", "roadside"]).optional(),
  // Non-cost, non-financial header fields the WO edit modal collects. NONE of these feed the
  // Bill/Expense amount (cost flows only through the line-item endpoints) so they are safe to PATCH
  // even after an AP document is posted. Columns verified against db/migrations/ (0310 priority,
  // 202606221100 VMRS/complaint-cause-correction/out_of_service, 202606221200 authorization/service-location/repaired-by).
  wo_priority: z.enum(["routine", "urgent", "immediate"]).optional(),
  vmrs_system_code: z.string().trim().max(40).optional(),
  vmrs_assembly_code: z.string().trim().max(40).optional(),
  vmrs_component_code: z.string().trim().max(40).optional(),
  out_of_service: z.boolean().optional(),
  repair_complaint: z.string().trim().max(2000).optional(),
  repair_cause: z.string().trim().max(2000).optional(),
  repair_correction: z.string().trim().max(2000).optional(),
  authorization_number: z.string().trim().max(120).optional(),
  service_location_type: z.enum(["shop", "mobile", "roadside"]).optional(),
  repaired_by: z.enum(["in_house", "outside_vendor"]).optional(),
});

const transitionSchema = z.object({
  new_status: workOrderStatusSchema,
  cancellation_reason: z.string().trim().max(300).optional(),
});

const lineItemCreateSchema = z.object({
  line_type: z.enum(["parts", "labor", "other"]),
  description: z.string().trim().max(500),
  quantity: z.number().min(0),
  unit_cost: z.number().min(0),
  amount: z.number().min(0),
});

const allowedTransitions: Record<z.infer<typeof workOrderStatusSchema>, z.infer<typeof workOrderStatusSchema>[]> = {
  open: ["in_progress", "cancelled"],
  in_progress: ["waiting_parts", "complete", "cancelled"],
  waiting_parts: ["in_progress", "cancelled"],
  complete: [],
  cancelled: [],
};

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, err: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: err.flatten() });
}

const G18_REQUIRED_CODES = new Set(["FUEL", "DIESEL", "ROADSIDE", "TOLL", "PARKING"]);
const G18_DESCRIPTION_REGEX = /\b(fuel|diesel|roadside|toll|parking)\b/i;
const CLOSED_STATUSES = new Set(["closed", "completed", "voided", "complete", "cancelled"]);

async function relationExists(
  client: { query: <R = { ok: boolean }>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> },
  relName: string
) {
  const res = await client.query<{ ok: boolean }>(`SELECT to_regclass($1) IS NOT NULL AS ok`, [relName]);
  return Boolean(res.rows[0]?.ok);
}

async function columnExists(
  client: { query: <R = { ok: boolean }>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }> },
  schema: string,
  table: string,
  column: string
) {
  const res = await client.query<{ ok: boolean }>(
    `SELECT 1 AS ok FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3 LIMIT 1`,
    [schema, table, column]
  );
  return Boolean(res.rows[0]);
}

// ── FINANCIAL GUARD ──────────────────────────────────────────────────────────
// WO cost lines auto-create a Bill (A/P) or Expense. Once that AP document is POSTED (on the AP
// ledger) or PAID, editing the WO's cost/line-items would silently diverge the WO from its Bill.
// We refuse the cost edit and tell the user to void the linked bill first (void-not-delete governance).
// A still-DRAFT bill (auto-created at WO-create time, not yet posted) is safe to edit.
export const WO_POSTED_AP_ERROR = "E_WO_POSTED_BILL_LOCK";

export class WoPostedApError extends Error {
  public readonly detail: { kind: "bill" | "expense"; id: string; status: string | null };
  constructor(detail: { kind: "bill" | "expense"; id: string; status: string | null }) {
    super("wo_cost_locked_by_posted_ap");
    this.name = "WoPostedApError";
    this.detail = detail;
  }
}

export function isWoPostedApError(error: unknown): error is WoPostedApError {
  return error instanceof WoPostedApError;
}

type ApGuardClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

// Returns the first POSTED/PAID (non-draft, non-voided) AP document linked to this WO, or null.
// Draft bills are editable; voided/revoked/cancelled documents no longer bind the WO.
export async function findPostedApForWo(
  client: ApGuardClient,
  companyId: string,
  woId: string
): Promise<{ kind: "bill" | "expense"; id: string; status: string | null } | null> {
  if (await relationExists(client, "accounting.bills")) {
    const hasRevoked = await columnExists(client, "accounting", "bills", "revoked_at");
    const bill = await client.query<{ id: string; status: string | null }>(
      `
        SELECT id::text AS id, status
        FROM accounting.bills
        WHERE operating_company_id = $1::uuid
          AND linked_work_order_uuid = $2::uuid
          ${hasRevoked ? "AND revoked_at IS NULL" : ""}
          AND lower(coalesce(status, '')) NOT IN ('draft', 'void', 'voided', 'cancelled')
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [companyId, woId]
    );
    if (bill.rows[0]?.id) return { kind: "bill", id: bill.rows[0].id, status: bill.rows[0].status ?? null };
  }
  if (
    (await relationExists(client, "accounting.expenses")) &&
    (await columnExists(client, "accounting", "expenses", "linked_work_order_uuid"))
  ) {
    const hasRevoked = await columnExists(client, "accounting", "expenses", "revoked_at");
    const exp = await client.query<{ id: string; status: string | null }>(
      `
        SELECT id::text AS id, status
        FROM accounting.expenses
        WHERE operating_company_id = $1::uuid
          AND linked_work_order_uuid = $2::uuid
          ${hasRevoked ? "AND revoked_at IS NULL" : ""}
          AND lower(coalesce(status, '')) = 'posted'
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [companyId, woId]
    );
    if (exp.rows[0]?.id) return { kind: "expense", id: exp.rows[0].id, status: exp.rows[0].status ?? null };
  }
  return null;
}

function postedApReply(reply: FastifyReply, posted: { kind: "bill" | "expense"; id: string; status: string | null }) {
  return reply.code(409).send({
    error: WO_POSTED_AP_ERROR,
    locked_by: posted.kind,
    locked_id: posted.id,
    locked_status: posted.status,
    message:
      posted.kind === "bill"
        ? "This work order already has a posted bill in Accounts Payable. Void the linked bill first, then edit its cost lines."
        : "This work order already has a posted expense. Void the linked expense first, then edit its cost lines.",
  });
}

async function hasLoadRequiredExpenseCategories(
  client: { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> },
  sectionA: Array<{ description: string; expense_category_uuid: string }>
) {
  if (sectionA.some((line) => G18_DESCRIPTION_REGEX.test(line.description))) {
    return true;
  }

  if (!(await relationExists(client, "catalogs.qbo_categories"))) return false;
  const categoryIds = Array.from(new Set(sectionA.map((line) => line.expense_category_uuid).filter(Boolean)));
  if (categoryIds.length === 0) return false;

  const categories = await client.query<{ code: string | null; display_name: string | null }>(
    `
      SELECT code, display_name
      FROM catalogs.qbo_categories
      WHERE id = ANY($1::uuid[])
    `,
    [categoryIds]
  );
  return categories.rows.some((row) => {
    const code = String(row.code ?? "").toUpperCase();
    const displayName = String(row.display_name ?? "").toUpperCase();
    return G18_REQUIRED_CODES.has(code) || G18_REQUIRED_CODES.has(displayName);
  });
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: any) => Promise<T>) {
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    return fn(client);
  });
}

async function maintenanceReady(client: any) {
  const res = await client.query(
    `SELECT to_regclass('maintenance.work_orders') IS NOT NULL AS ok`
  );
  return Boolean((res.rows[0] as { ok?: boolean } | undefined)?.ok);
}

export async function registerMaintenanceWorkOrderRoutes(app: FastifyInstance) {
  app.get("/api/v1/maintenance/work-orders/by-bucket", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = listByBucketQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const q = parsed.data;
    const payload = await withCompany(user.uuid, q.operating_company_id, async (client) => {
      if (!(await maintenanceReady(client))) return { in_house: [], external: [], roadside: [] };
      return listWorkOrdersByBucket(client, q.operating_company_id);
    });
    return payload;
  });

  app.get("/api/v1/maintenance/work-orders", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const q = parsed.data;

    const payload = await withCompany(user.uuid, q.operating_company_id, async (client) => {
      if (!(await maintenanceReady(client))) return { rows: [], total: 0 };
      const values: unknown[] = [q.operating_company_id];
      const where: string[] = ["w.operating_company_id = $1::uuid"];
      // MAINT-2: Active WOs list + KPI share openWorkOrderPredicate (open status set + voided_at IS NULL).
      // Explicit status or equipment_id drill-through keeps caller-controlled scope; default list = open WOs only.
      if (q.status) {
        values.push(q.status);
        where.push(`w.status = $${values.length}`);
        where.push("w.voided_at IS NULL");
      } else if (q.equipment_id || q.load_id || q.driver_id) {
        // LOAD-WO-REVERSE / DRV-LINK-WO-REVERSE: caller-controlled scope — include completed history;
        // voided stay hidden (void-not-delete).
        where.push("w.voided_at IS NULL");
      } else {
        where.push(openWorkOrderPredicate("w"));
      }
      if (q.load_id) {
        values.push(q.load_id);
        where.push(`w.load_id = $${values.length}`);
      }
      if (q.driver_id) {
        values.push(q.driver_id);
        where.push(`w.driver_id = $${values.length}`);
      }
      if (q.wo_type) {
        values.push(q.wo_type);
        where.push(`w.wo_type = $${values.length}`);
      }
      if (q.source_type) {
        values.push(q.source_type);
        where.push(`w.source_type = $${values.length}`);
      }
      if (q.external_vendor_id) {
        values.push(q.external_vendor_id);
        where.push(`w.external_vendor_id = $${values.length}`);
      }
      if (q.equipment_id) {
        values.push(q.equipment_id);
        where.push(`w.equipment_id = $${values.length}`);
      }
      if (q.search) {
        values.push(`%${q.search}%`);
        where.push(`(COALESCE(w.display_id, '') ILIKE $${values.length} OR COALESCE(w.description, '') ILIKE $${values.length})`);
      }
      if (q.location) {
        values.push(q.location);
        where.push(`w.repair_location = $${values.length}`);
      }
      if (q.bucket) {
        values.push(q.bucket);
        where.push(`w.bucket = $${values.length}::maintenance.wo_bucket_enum`);
      }
      const countRes = await client.query(
        `SELECT count(*)::int AS cnt FROM maintenance.work_orders w WHERE ${where.join(" AND ")}`,
        values
      );
      values.push(q.limit, q.offset);
      // MAINT-3: join the unit so the table renders the unit number (e.g. T139) instead of a raw
      // UUID fragment. The JOIN is entity-scoped (mdata.units has no operating_company_id — it uses
      // owner_company_id / currently_leased_to_company_id) so a unit name can NEVER leak across
      // operating companies (USMCA isolation); a foreign unit LEFT-JOINs to NULL → UUID fallback.
      const rowsRes = await client.query(
        `SELECT w.*, u.unit_number, e.equipment_number,
                NULLIF(TRIM(COALESCE(d.first_name, '') || ' ' || COALESCE(d.last_name, '')), '') AS driver_name,
                COALESCE(w.external_vendor_id, w.vendor_id)::text AS resolved_vendor_id,
                v.vendor_name AS resolved_vendor_name,
                l.load_number AS linked_load_number
           FROM maintenance.work_orders w
           LEFT JOIN mdata.units u
             ON u.id = w.unit_id
            AND (u.owner_company_id = w.operating_company_id
                 OR u.currently_leased_to_company_id = w.operating_company_id)
           LEFT JOIN mdata.equipment e
             ON e.id = w.equipment_id
            AND COALESCE(e.currently_leased_to_company_id, e.owner_company_id) = w.operating_company_id
           LEFT JOIN mdata.drivers d ON d.id = w.driver_id AND d.operating_company_id = w.operating_company_id
           LEFT JOIN mdata.vendors v ON v.id = COALESCE(w.external_vendor_id, w.vendor_id) AND v.operating_company_id = w.operating_company_id
           LEFT JOIN mdata.loads l ON l.id = w.load_id AND l.operating_company_id = w.operating_company_id
          WHERE ${where.join(" AND ")}
          ORDER BY w.opened_at DESC NULLS LAST, w.created_at DESC
          LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values
      );
      return { rows: rowsRes.rows, total: Number((countRes.rows[0] as { cnt?: number } | undefined)?.cnt ?? 0) };
    });
    return { work_orders: payload.rows, total_count: payload.total };
  });

  app.get("/api/v1/maintenance/work-orders/:id", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const companyId = String((req.query as Record<string, unknown> | undefined)?.["operating_company_id"] ?? "");
    if (!companyId) return reply.code(400).send({ error: "operating_company_id_required" });

    const detail = await withCompany(user.uuid, companyId, async (client) => {
      if (!(await maintenanceReady(client))) return null;
      // MAINT-DETAIL-UUID-LABEL: the list route already joins unit_number (MAINT-3 above); the
      // detail route's SELECT * had NO joins at all, so unit_name/driver/vendor/roadside-load
      // EntityLinks on WorkOrderDetailPage all fell back to the raw uuid despite the label prop
      // being wired — the backend simply never sent a name to put there.
      const wo = await client.query(
        `SELECT w.*, u.unit_number, e.equipment_number,
                NULLIF(TRIM(COALESCE(d.first_name, '') || ' ' || COALESCE(d.last_name, '')), '') AS driver_name,
                COALESCE(w.external_vendor_id, w.vendor_id)::text AS resolved_vendor_id,
                v.vendor_name AS resolved_vendor_name,
                l.load_number AS linked_load_number,
                rl.load_number AS roadside_breakdown_load_number,
                si.issue_category AS source_intransit_issue_category,
                si.issue_description AS source_intransit_issue_description,
                si.severity AS source_intransit_issue_severity,
                si.reported_at AS source_intransit_issue_reported_at,
                si.gps_label AS source_intransit_issue_gps_label,
                ic.claim_number AS insurance_claim_number
           FROM maintenance.work_orders w
           LEFT JOIN mdata.units u
             ON u.id = w.unit_id
            AND (u.owner_company_id = w.operating_company_id
                 OR u.currently_leased_to_company_id = w.operating_company_id)
           LEFT JOIN mdata.equipment e
             ON e.id = w.equipment_id
            AND COALESCE(e.currently_leased_to_company_id, e.owner_company_id) = w.operating_company_id
           LEFT JOIN mdata.drivers d ON d.id = w.driver_id AND d.operating_company_id = w.operating_company_id
           LEFT JOIN mdata.vendors v ON v.id = COALESCE(w.external_vendor_id, w.vendor_id) AND v.operating_company_id = w.operating_company_id
           LEFT JOIN mdata.loads l ON l.id = w.load_id AND l.operating_company_id = w.operating_company_id
           LEFT JOIN mdata.loads rl ON rl.id = w.roadside_breakdown_load_id AND rl.operating_company_id = w.operating_company_id
           LEFT JOIN dispatch.intransit_issues si ON si.id = w.source_intransit_issue_id AND si.operating_company_id = w.operating_company_id
           LEFT JOIN insurance.claim ic ON ic.id = w.insurance_claim_id AND ic.tenant_id = w.operating_company_id
          WHERE w.id = $1 AND w.operating_company_id = $2::uuid LIMIT 1`,
        [params.data.id, companyId]
      );
      if (wo.rowCount === 0) return null;
      const lines = await client.query(`SELECT * FROM maintenance.work_order_lines WHERE work_order_uuid = $1 ORDER BY created_at ASC`, [params.data.id]);
      const history = await client.query(`SELECT * FROM maintenance.wo_status_history WHERE work_order_id = $1 ORDER BY created_at ASC`, [params.data.id]);
      return { ...wo.rows[0], line_items: lines.rows, status_history: history.rows };
    });

    if (!detail) return reply.code(404).send({ error: "work_order_not_found" });
    return detail;
  });

  app.get("/api/v1/maintenance/work-orders/:id/pdf", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const companyId = String((req.query as Record<string, unknown> | undefined)?.["operating_company_id"] ?? "");
    if (!companyId) return reply.code(400).send({ error: "operating_company_id_required" });

    // Canonical WO PDF renderer lives under /api/v1/work-orders/:id/pdf.
    return reply.redirect(
      `/api/v1/work-orders/${encodeURIComponent(params.data.id)}/pdf?operating_company_id=${encodeURIComponent(companyId)}`,
      307
    );
  });

  app.get("/api/v1/maintenance/part-locations", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const companyId = String((req.query as Record<string, unknown> | undefined)?.["operating_company_id"] ?? "");
    const unitClass = String((req.query as Record<string, unknown> | undefined)?.["unit_class"] ?? "").trim();
    if (!companyId) return reply.code(400).send({ error: "operating_company_id_required" });
    const rows = await withCompany(user.uuid, companyId, async (client) => {
      const values: unknown[] = [companyId];
      let where = "operating_company_id = $1::uuid AND is_active = true";
      if (unitClass) {
        values.push(unitClass);
        where += ` AND (applies_to = 'both' OR applies_to = $${values.length})`;
      }
      const res = await client.query(
        `
          SELECT id, location_code, location_name, applies_to, category, display_order
          FROM catalogs.maintenance_part_locations
          WHERE ${where}
          ORDER BY display_order ASC, location_code ASC
        `,
        values
      );
      return res.rows;
    });
    return { rows };
  });

  app.post("/api/v1/maintenance/work-orders", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const v5Parsed = createWorkOrderV5Schema.safeParse(req.body ?? {});

    // SHAPE-DISCRIMINATE BEFORE FALLING BACK. This endpoint accepts two body shapes: the two-section
    // V5 payload the Create WO modal sends, and a legacy flat one. Previously a V5 payload that failed
    // V5 validation — a missing Section-A line description, say — silently fell through to the LEGACY
    // schema, which then failed on fields the client never sent. The caller was told "wo_type is
    // required" for a body that had wo_type nested under `header`, so the real error was unreachable
    // and the WO could not be created without guessing. A body carrying V5's own keys is a V5 body,
    // and its errors are the ones worth reporting.
    const raw = (req.body ?? {}) as Record<string, unknown>;
    const looksLikeV5 = ["header", "sectionA", "sectionB"].some((k) => k in raw);
    if (!v5Parsed.success && looksLikeV5) {
      return validationError(reply, v5Parsed.error);
    }

    if (v5Parsed.success) {
      const body = v5Parsed.data;
      const role = user.role;
      if (!["Owner", "Administrator", "Manager", "Dispatcher", "Safety"].includes(role)) {
        return reply.code(403).send({ error: "forbidden" });
      }
      if (body.header.payment_timing === "paid_same_day") {
        const requiresLoad = await withCompany(user.uuid, body.header.operating_company_id, async (client) =>
          hasLoadRequiredExpenseCategories(client, body.sectionA)
        );
        if (requiresLoad && !body.header.load_id && !body.header.load_exemption_reason) {
          return reply.code(422).send({
            error: "E_DIESEL_REQUIRES_LOAD",
            message: "Diesel/over-the-road expenses must link to a load (G18 invariant)",
          });
        }
      }
      try {
        assertRoadsideFields(body.header);
      } catch (error) {
        return reply.code(422).send({ error: String((error as Error).message || "E_ROADSIDE_INVALID") });
      }
      try {
        const result = await withCompany(user.uuid, body.header.operating_company_id, async (client) => {
          if (body.header.vendor_id) {
            // MNT-VENDOR-CANONICAL (2026-08-02): validate against CANONICAL mdata.vendors, not the
            // RETIRE mdata.qbo_vendors mirror. The mirror is EMPTY for any entity without a QuickBooks
            // connection — USMCA has 4 vendors in mdata.vendors and 0 in the mirror — so this lookup
            // returned nothing and every vendor work order in USMCA failed with bad_vendor, blocking
            // the maintenance -> vendor -> A/P -> expense-GL chain entirely. LINKAGE LAW §10: vendors
            // (AP truth) are mdata.vendors; the WO picker must stop using the mirror. The FK moved with
            // it in migration 202611170000 — repointing this read alone would have traded a bad_vendor
            // rejection for an FK violation on write.
            const vr = await client.query(
              `SELECT 1 FROM mdata.vendors WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
              [body.header.vendor_id, body.header.operating_company_id]
            );
            if ((vr.rowCount ?? 0) === 0) {
              return { kind: "bad_vendor" as const };
            }
          }
          await client.query("BEGIN");
          try {
            type SourceIssueRow = { id: string; unit_id: string; driver_id: string | null; load_id: string | null };
            let sourceIssue: SourceIssueRow | null = null;
            if (body.header.source_intransit_issue_id) {
              const sourceIssueRes = await client.query(
                `SELECT id, unit_id, driver_id, load_id
                   FROM dispatch.intransit_issues
                  WHERE id = $1::uuid
                    AND operating_company_id = $2::uuid
                    AND promoted_to_wo_id IS NULL
                    AND promoted_to_damage_report_id IS NULL
                  FOR UPDATE`,
                [body.header.source_intransit_issue_id, body.header.operating_company_id]
              );
              sourceIssue = (sourceIssueRes.rows[0] as SourceIssueRow | undefined) ?? null;
              if (!sourceIssue) throw new Error("E_SOURCE_INTRANSIT_ISSUE_UNAVAILABLE");
              if (sourceIssue.unit_id !== body.header.unit_id) throw new Error("E_SOURCE_INTRANSIT_UNIT_MISMATCH");
              if (sourceIssue.driver_id && sourceIssue.driver_id !== body.header.driver_id) {
                throw new Error("E_SOURCE_INTRANSIT_DRIVER_MISMATCH");
              }
              if (
                sourceIssue.load_id &&
                (sourceIssue.load_id !== body.header.load_id ||
                  sourceIssue.load_id !== body.header.roadside_breakdown_load_id)
              ) {
                throw new Error("E_SOURCE_INTRANSIT_LOAD_MISMATCH");
              }
              if (body.header.source_type !== "IT") throw new Error("E_SOURCE_INTRANSIT_TYPE_MISMATCH");
            }
            const created = await createWorkOrderWithLines(client as never, user.uuid, body.header, body.sectionA, body.sectionB);
            if (sourceIssue) {
              const woLineage = await client.query(
                `UPDATE maintenance.work_orders
                    SET source_intransit_issue_id = $1::uuid,
                        updated_at = now()
                  WHERE id = $2::uuid
                    AND operating_company_id = $3::uuid`,
                [sourceIssue.id, created.woUuid, body.header.operating_company_id]
              );
              if ((woLineage.rowCount ?? 0) !== 1) throw new Error("E_SOURCE_INTRANSIT_WO_LINEAGE_FAILED");

              const issueLineage = await client.query(
                `UPDATE dispatch.intransit_issues
                    SET promoted_to_wo_id = $1::uuid
                  WHERE id = $2::uuid
                    AND operating_company_id = $3::uuid
                    AND promoted_to_wo_id IS NULL
                    AND promoted_to_damage_report_id IS NULL`,
                [created.woUuid, sourceIssue.id, body.header.operating_company_id]
              );
              if ((issueLineage.rowCount ?? 0) !== 1) throw new Error("E_SOURCE_INTRANSIT_ISSUE_LINEAGE_FAILED");

              await enqueueOutboxEvent(
                client,
                "maintenance.triage.converted_to_wo",
                { aggregate_type: "dispatch.intransit_issues", aggregate_id: sourceIssue.id },
                {
                  issue_id: sourceIssue.id,
                  work_order_id: created.woUuid,
                  operating_company_id: body.header.operating_company_id,
                }
              );
              await appendCrudAudit(
                client,
                user.uuid,
                "maintenance.triage.converted_to_wo",
                {
                  resource_type: "dispatch.intransit_issues",
                  resource_id: sourceIssue.id,
                  work_order_id: created.woUuid,
                  operating_company_id: body.header.operating_company_id,
                },
                "info",
                "WF-049-INTRANSIT-TO-WO"
              );
            }
            // Option B: link create-time draft attachments (WO photos/estimates) to the real WO id,
            // atomically in this txn. This is the endpoint the Create WO modal actually posts to.
            await reassignDraftAttachments(client as never, {
              operatingCompanyId: body.header.operating_company_id,
              entityType: "work_order",
              draftId: body.header.attachment_draft_id,
              newId: created.woUuid,
            });
            // Block 8 — asset-location map: persist serialized-part placements for this WO (entity-scoped).
            for (const sp of body.serialized_parts) {
              await client.query(
                `INSERT INTO maintenance.wo_serialized_parts
                   (operating_company_id, work_order_id, unit_id, part_label, part_type, serial_number, position_code, notes)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
                [
                  body.header.operating_company_id,
                  created.woUuid,
                  sp.unit_id ?? body.header.unit_id ?? null,
                  sp.part_label,
                  sp.part_type,
                  sp.serial_number ?? null,
                  sp.position_code ?? null,
                  sp.notes ?? null,
                ]
              );
            }
            if (body.header.equipment_id) {
              await client.query(
                `UPDATE maintenance.work_orders SET equipment_id = $2::uuid, updated_at = now() WHERE id = $1::uuid`,
                [created.woUuid, body.header.equipment_id]
              );
            }
            if (body.header.bucket === "roadside") {
              await appendCrudAudit(
                client,
                user.uuid,
                "maintenance.work_order.bucket_changed",
                {
                  resource_type: "maintenance.work_orders",
                  resource_id: created.woUuid,
                  operating_company_id: body.header.operating_company_id,
                  bucket: body.header.bucket,
                },
                "info",
                "P5-F1-ROADSIDE-BUCKET"
              );
            }
            let bill: { uuid: string } | null = null;
            let expense: { uuid: string } | null = null;
            if (body.header.payment_timing === "vendor_invoice") {
              bill = await autoCreateBillFromWO(client as never, user.uuid, created.woUuid);
            } else if (body.header.payment_timing === "paid_same_day") {
              expense = await autoCreateExpenseFromWO(
                client as never,
                user.uuid,
                created.woUuid,
                body.header.payment_account_uuid ?? null,
                body.header.load_exemption_reason ?? null
              );
            } else {
              await allocateInHouseFromWO(client as never, user.uuid, created.woUuid);
            }
            await validateWoVendorInvoiceTotals(client as never, created.woUuid);
            await client.query("COMMIT");
            return {
              wo: { uuid: created.woUuid, display_id: created.display_id },
              bill: bill ?? undefined,
              expense: expense ?? undefined,
            };
          } catch (error) {
            await client.query("ROLLBACK");
            throw error;
          }
        });
        if (result && typeof result === "object" && "kind" in result && (result as { kind?: string }).kind === "bad_vendor") {
          return reply.code(400).send({
            error: "invalid_vendor_id",
            message: "vendor_id must reference a synced QuickBooks vendor for this operating company",
          });
        }
        void withCurrentUser(user.uuid, (client) =>
          emitMaintenanceSpineEvent(client, {
            operating_company_id: body.header.operating_company_id,
            actor_user_id: user.uuid,
            event_type: "wo.created",
            work_order_id: (result as { wo?: { uuid: string } })?.wo?.uuid ?? "",
            payload: { bucket: body.header.bucket, payment_timing: body.header.payment_timing },
          })
        ).catch((err) =>
          req.log.warn(
            {
              err,
              work_order_id: (result as { wo?: { uuid: string } })?.wo?.uuid ?? null,
              company_id: body.header.operating_company_id,
            },
            "spine_emit_wo_created_failed"
          )
        );
        return reply.code(201).send(result);
      } catch (error) {
        if (isWoInvoiceMismatch(error)) {
          return reply.code(409).send({
            error: error.code,
            total_line_items_cents: error.total_line_items_cents,
            vendor_invoice_cents: error.vendor_invoice_cents,
            delta_cents: error.delta_cents,
            source: error.source,
            message:
              "Work-order line total does not match the vendor invoice amount. Correct the lines or the invoice before closing.",
          });
        }
        const message = String((error as Error)?.message ?? "");
        if (message.includes("E_DIESEL_REQUIRES_LOAD")) {
          return reply.code(422).send({
            error: "E_DIESEL_REQUIRES_LOAD",
            message: "Diesel/over-the-road expenses must link to a load (G18 invariant)",
          });
        }
        if (message.includes("E_SOURCE_INTRANSIT_ISSUE_UNAVAILABLE")) {
          return reply.code(409).send({
            error: "E_SOURCE_INTRANSIT_ISSUE_UNAVAILABLE",
            message: "The in-transit issue is unavailable or was already converted. Refresh the triage queue.",
          });
        }
        if (message.includes("E_SOURCE_INTRANSIT_")) {
          return reply.code(409).send({
            error: message,
            message: "The work-order linkage no longer matches the source in-transit issue. Reopen it from triage.",
          });
        }
        throw error;
      }
    }

    const parsed = createWorkOrderSchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const body = parsed.data;

    const role = user.role;
    if (!["Owner", "Administrator", "Manager", "Dispatcher", "Safety"].includes(role)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    if (["repair", "tire", "accident"].includes(body.wo_type) && !body.driver_id) {
      return reply.code(400).send({ error: "driver_required_for_selected_type" });
    }
    if (["repair", "tire", "accident"].includes(body.wo_type) && !body.load_id) {
      return reply.code(400).send({ error: "load_required_for_selected_type" });
    }
    try {
      assertRoadsideFields(body);
    } catch (error) {
      return reply.code(422).send({ error: String((error as Error).message || "E_ROADSIDE_INVALID") });
    }
    if (body.repair_location !== "in_house" && !body.vendor_id) {
      return reply.code(400).send({ error: "vendor_required_for_external_repairs" });
    }
    if (["ES", "AC", "ET", "RT", "RS"].includes(body.source_type)) {
      if (!body.external_vendor_id || !body.external_vendor_wo_number || !body.external_vendor_invoice_number) {
        return reply.code(400).send({
          error: "external_vendor_fields_required",
          message:
            "source_type ES/AC/ET/RT/RS requires external_vendor_id, external_vendor_wo_number, external_vendor_invoice_number",
        });
      }
    }

    let created:
      | { unavailable: true }
      | { unavailable: false; row: Record<string, unknown> }
      | undefined;
    try {
      created = await withCompany(user.uuid, body.operating_company_id, async (client) => {
      if (!(await maintenanceReady(client))) {
        return { unavailable: true as const };
      }

      const displayIdRes = await client.query(
        `
          SELECT display_id, sequence
          FROM maintenance.next_wo_display_id($1, $2, COALESCE($3::date, CURRENT_DATE), $4)
        `,
        [body.unit_id, body.source_type, body.service_date ?? null, body.operating_company_id]
      );
      const display = displayIdRes.rows[0];

      const woRes = await client.query(
        `
          INSERT INTO maintenance.work_orders (
            operating_company_id, wo_type, status, unit_id, equipment_id, driver_id, load_id, opened_at,
            repair_location, vendor_id, external_vendor_invoice_number, description,
            source_type, external_vendor_id, external_vendor_wo_number,
            display_id, unit_sequence,
            bucket, roadside_callout_at, roadside_arrived_at, roadside_provider_vendor_id, roadside_location, roadside_breakdown_load_id
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,COALESCE($8::timestamptz, now()),$9,$10,$11,$12,
            $13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23
          )
          RETURNING *
        `,
        [
          body.operating_company_id,
          body.wo_type,
          body.status,
          body.unit_id,
          body.equipment_id ?? null,
          body.driver_id ?? null,
          body.load_id ?? null,
          body.service_date ?? null,
          body.repair_location,
          body.vendor_id ?? null,
          body.external_vendor_invoice_number ?? body.vendor_invoice_number ?? null,
          body.description,
          body.source_type,
          body.external_vendor_id ?? null,
          body.external_vendor_wo_number ?? null,
          display?.display_id ?? null,
          Number(display?.sequence ?? 0) || null,
          body.bucket ?? "in_house",
          body.roadside_callout_at ?? null,
          body.roadside_arrived_at ?? null,
          body.roadside_provider_vendor_id ?? null,
          body.roadside_location ?? null,
          body.roadside_breakdown_load_id ?? null,
        ]
      );
      let wo = woRes.rows[0];

      // LV-WO-DISPLAY-ID-V5-IS-HARDCODED-PEND0 — next_wo_display_id mints with -PEND0 (correct when
      // no vendor/parts ref yet). Rule 03 V5 is vendor-invoice / LABOR / pending — never unit serial.
      // For ES/AC/ET/RT/RS create requires invoice numbers, so refresh immediately so the returned
      // display_id carries the real V5 (last 5 of invoice) instead of a permanent -PEND0 stamp.
      await client.query(`SELECT maintenance.refresh_wo_display_id($1)`, [wo.id]);
      const refreshedWo = await client.query(`SELECT * FROM maintenance.work_orders WHERE id = $1 LIMIT 1`, [wo.id]);
      if (refreshedWo.rows[0]) wo = refreshedWo.rows[0];

      for (const line of body.line_items) {
        await client.query(
          `
            INSERT INTO maintenance.work_order_lines (work_order_uuid, line_type, description, quantity, unit_cost, total_cost)
            VALUES ($1,$2,$3,$4,$5,$6)
          `,
          [wo.id, line.line_type, line.description, line.quantity, line.unit_cost, line.amount]
        );
      }

      await client.query(
        `
          INSERT INTO maintenance.wo_status_history (work_order_id, from_status, to_status, changed_at, changed_by_user_id)
          VALUES ($1, NULL, $2, now(), $3)
        `,
        [wo.id, wo.status, user.uuid]
      );

      if (body.payment_timing !== "in_house") {
        await client.query(
          `
            INSERT INTO outbox.outbox_queue (aggregate_type, aggregate_id, event_type, payload)
            VALUES ($1,$2,$3,$4::jsonb)
          `,
          [
            "maintenance.work_orders",
            wo.id,
            body.payment_timing === "vendor_invoice" ? "maintenance.qbo.bill.sync" : "maintenance.qbo.expense.sync",
            JSON.stringify({ work_order_id: wo.id, payment_timing: body.payment_timing }),
          ]
        );
      }

      await appendCrudAudit(
        client,
        user.uuid,
        "maintenance.wo.created",
        {
          resource_type: "maintenance.work_orders",
          resource_id: wo.id,
          operating_company_id: wo.operating_company_id,
          wo_type: wo.wo_type,
          source_type: wo.source_type,
          display_id: wo.display_id,
          payment_timing: body.payment_timing,
        },
        "info",
        "BT-3-MAINTENANCE-REBUILD"
      );
      await appendCrudAudit(
        client,
        user.uuid,
        "maintenance.work_order.opened",
        {
          resource_type: "maintenance.work_orders",
          resource_id: wo.id,
          operating_company_id: wo.operating_company_id,
          opened_at: wo.opened_at ?? wo.created_at ?? new Date().toISOString(),
          status: wo.status,
        },
        "info",
        "P5-D5-WO-TIME"
      );

      await appendCrudAudit(
        client,
        user.uuid,
        "maintenance.wo_display_id_generated",
        {
          resource_type: "maintenance.work_orders",
          resource_id: wo.id,
          operating_company_id: wo.operating_company_id,
          display_id: wo.display_id,
          unit_sequence: wo.unit_sequence,
        },
        "info",
        "BT-3-MAINTENANCE-REBUILD"
      );
      if ((body.bucket ?? "in_house") !== "in_house") {
        await appendCrudAudit(
          client,
          user.uuid,
          "maintenance.work_order.bucket_changed",
          {
            resource_type: "maintenance.work_orders",
            resource_id: wo.id,
            operating_company_id: wo.operating_company_id,
            bucket: body.bucket,
          },
          "info",
          "P5-F1-ROADSIDE-BUCKET"
        );
      }

      await validateWoVendorInvoiceTotals(client, String(wo.id));

      return { unavailable: false as const, row: wo };
    });
    } catch (error) {
      if (isWoInvoiceMismatch(error)) {
        const err = error;
        return reply.code(409).send({
          error: err.code,
          total_line_items_cents: err.total_line_items_cents,
          vendor_invoice_cents: err.vendor_invoice_cents,
          delta_cents: err.delta_cents,
          source: err.source,
        });
      }
      throw error;
    }

    if (!created || created.unavailable) {
      return reply.code(501).send({ error: "maintenance_schema_not_available" });
    }
    return reply.code(201).send(created.row);
  });

  app.patch("/api/v1/maintenance/work-orders/:id", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const parsed = updateWorkOrderSchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const companyId = String((req.query as Record<string, unknown> | undefined)?.["operating_company_id"] ?? "");
    if (!companyId) return reply.code(400).send({ error: "operating_company_id_required" });
    const body = parsed.data;

    const result = await withCompany(user.uuid, companyId, async (client) => {
      if (!(await maintenanceReady(client))) return { unavailable: true as const };
      const currentRes = await client.query(`SELECT * FROM maintenance.work_orders WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`, [
        params.data.id,
        companyId,
      ]);
      const current = currentRes.rows[0];
      if (!current) return { notFound: true as const };
      if (body.external_vendor_id === null || body.external_vendor_wo_number === null || body.external_vendor_invoice_number === null) {
        return { invalid: true as const, error: "external_vendor_fields_cannot_be_cleared" };
      }
      if (body.bucket && CLOSED_STATUSES.has(String(current.status ?? ""))) {
        return { invalid: true as const, error: "E_BUCKET_IMMUTABLE_WHEN_CLOSED" };
      }
      // FINANCIAL GUARD: changing the vendor FK after the Bill is posted would orphan the WO from its
      // AP Bill (the bill was created against COALESCE(external_vendor_id, vendor_id)). Descriptive
      // header fields (description/priced-neutral notes) stay editable; only the vendor swap is locked.
      if (
        body.external_vendor_id !== undefined &&
        body.external_vendor_id !== null &&
        String(body.external_vendor_id) !== String(current.external_vendor_id ?? "")
      ) {
        const posted = await findPostedApForWo(client, companyId, params.data.id);
        if (posted) return { postedLock: true as const, posted };
      }
      const updatedRes = await client.query(
        `
          UPDATE maintenance.work_orders
          SET
            external_vendor_id = COALESCE($2, external_vendor_id),
            external_vendor_wo_number = COALESCE($3, external_vendor_wo_number),
            external_vendor_invoice_number = COALESCE($4, external_vendor_invoice_number),
            description = COALESCE($5, description),
            bucket = COALESCE($6::maintenance.wo_bucket_enum, bucket),
            wo_priority = COALESCE($7, wo_priority),
            vmrs_system_code = COALESCE($8, vmrs_system_code),
            vmrs_assembly_code = COALESCE($9, vmrs_assembly_code),
            vmrs_component_code = COALESCE($10, vmrs_component_code),
            out_of_service = COALESCE($11::boolean, out_of_service),
            repair_complaint = COALESCE($12, repair_complaint),
            repair_cause = COALESCE($13, repair_cause),
            repair_correction = COALESCE($14, repair_correction),
            authorization_number = COALESCE($15, authorization_number),
            service_location_type = COALESCE($16, service_location_type),
            repaired_by = COALESCE($17, repaired_by),
            updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [
          params.data.id,
          body.external_vendor_id ?? null,
          body.external_vendor_wo_number ?? null,
          body.external_vendor_invoice_number ?? null,
          body.description ?? null,
          body.bucket ?? null,
          body.wo_priority ?? null,
          body.vmrs_system_code ?? null,
          body.vmrs_assembly_code ?? null,
          body.vmrs_component_code ?? null,
          body.out_of_service ?? null,
          body.repair_complaint ?? null,
          body.repair_cause ?? null,
          body.repair_correction ?? null,
          body.authorization_number ?? null,
          body.service_location_type ?? null,
          body.repaired_by ?? null,
        ]
      );
      let updated = updatedRes.rows[0];
      // When vendor invoice/WO refs change, recompute V5 per Rule 03 (immutable only after complete).
      if (
        body.external_vendor_invoice_number !== undefined ||
        body.external_vendor_wo_number !== undefined
      ) {
        try {
          await client.query(`SELECT maintenance.refresh_wo_display_id($1)`, [params.data.id]);
          const refreshed = await client.query(
            `SELECT * FROM maintenance.work_orders WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`,
            [params.data.id, companyId],
          );
          if (refreshed.rows[0]) updated = refreshed.rows[0];
        } catch (err) {
          // E_WO_DISPLAY_ID_LOCKED when completed — leave display_id as-is
          if (!String((err as Error).message || "").includes("E_WO_DISPLAY_ID_LOCKED")) throw err;
        }
      }
      await appendCrudAudit(
        client,
        user.uuid,
        "maintenance.wo.updated",
        {
          resource_type: "maintenance.work_orders",
          resource_id: params.data.id,
          operating_company_id: companyId,
          changes: {
            external_vendor_id: body.external_vendor_id ?? undefined,
            external_vendor_wo_number: body.external_vendor_wo_number ?? undefined,
            external_vendor_invoice_number: body.external_vendor_invoice_number ?? undefined,
            description: body.description ?? undefined,
            bucket: body.bucket ?? undefined,
            wo_priority: body.wo_priority ?? undefined,
            out_of_service: body.out_of_service ?? undefined,
            repaired_by: body.repaired_by ?? undefined,
            service_location_type: body.service_location_type ?? undefined,
            authorization_number: body.authorization_number ?? undefined,
          },
        },
        "info",
        "P3-T11.6.2-ARRIVING-SOON"
      );
      if (body.bucket && body.bucket !== String(current.bucket ?? "in_house")) {
        await appendCrudAudit(
          client,
          user.uuid,
          "maintenance.work_order.bucket_changed",
          {
            resource_type: "maintenance.work_orders",
            resource_id: params.data.id,
            operating_company_id: companyId,
            previous_bucket: current.bucket ?? "in_house",
            bucket: body.bucket,
          },
          "info",
          "P5-F1-ROADSIDE-BUCKET"
        );
      }
      return { row: updated };
    });
    if ("unavailable" in result) return reply.code(501).send({ error: "maintenance_schema_not_available" });
    if ("notFound" in result) return reply.code(404).send({ error: "work_order_not_found" });
    if ("postedLock" in result && result.posted) return postedApReply(reply, result.posted);
    if ("invalid" in result) return reply.code(400).send({ error: result.error });
    return result.row;
  });

  app.patch("/api/v1/maintenance/work-orders/:id/complete", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const companyId = String((req.query as Record<string, unknown> | undefined)?.["operating_company_id"] ?? "");
    if (!companyId) return reply.code(400).send({ error: "operating_company_id_required" });

    const result = await withCompany(user.uuid, companyId, async (client) => {
      if (!(await maintenanceReady(client))) return { unavailable: true as const };
      const currentRes = await client.query(`SELECT * FROM maintenance.work_orders WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`, [
        params.data.id,
        companyId,
      ]);
      const current = currentRes.rows[0];
      if (!current) return { notFound: true as const };
      try {
        await validateWoVendorInvoiceTotals(client, String(params.data.id));
        const updateRes = await client.query(
          `
            UPDATE maintenance.work_orders
            SET status = 'complete',
                updated_at = now()
            WHERE id = $1
            RETURNING *
          `,
          [params.data.id]
        );
        await appendCrudAudit(
          client,
          user.uuid,
          "maintenance.wo.completed",
          {
            resource_type: "maintenance.work_orders",
            resource_id: params.data.id,
            operating_company_id: companyId,
            source_type: updateRes.rows[0]?.source_type,
          },
          "info",
          "P3-T11.6.2-ARRIVING-SOON"
        );
        await appendCrudAudit(
          client,
          user.uuid,
          "maintenance.work_order.closed",
          {
            resource_type: "maintenance.work_orders",
            resource_id: params.data.id,
            operating_company_id: companyId,
            closed_at: updateRes.rows[0]?.closed_at ?? updateRes.rows[0]?.updated_at ?? new Date().toISOString(),
            status: updateRes.rows[0]?.status ?? "complete",
          },
          "info",
          "P5-D5-WO-TIME"
        );
        return { row: updateRes.rows[0] };
      } catch (error) {
        if (isWoInvoiceMismatch(error)) {
          return { invoiceMismatch: true as const, detail: error };
        }
        const message = String((error as Error).message ?? "completion_failed");
        if (message.includes("E_EXTERNAL_VENDOR_FIELDS_REQUIRED")) {
          return { blocked: true as const, code: "E_EXTERNAL_VENDOR_FIELDS_REQUIRED", message };
        }
        throw error;
      }
    });
    if ("unavailable" in result) return reply.code(501).send({ error: "maintenance_schema_not_available" });
    if ("notFound" in result) return reply.code(404).send({ error: "work_order_not_found" });
    if ("invoiceMismatch" in result) {
      const d = result.detail;
      if (!d) {
        return reply.code(409).send({
          error: "WO_INVOICE_MISMATCH",
          message:
            "Work-order line total does not match the vendor invoice amount. Correct the lines or the invoice before closing.",
        });
      }
      return reply.code(409).send({
        error: d.code,
        total_line_items_cents: d.total_line_items_cents,
        vendor_invoice_cents: d.vendor_invoice_cents,
        delta_cents: d.delta_cents,
        source: d.source,
        message:
          "Work-order line total does not match the vendor invoice amount. Correct the lines or the invoice before closing.",
      });
    }
    if ("blocked" in result) return reply.code(422).send({ error: result.code, message: result.message });
    await processMaintenanceWorkOrderClose({
      operating_company_id: companyId,
      work_order_id: params.data.id,
      actor_user_id: user.uuid,
    });
    void withCurrentUser(user.uuid, (client) =>
      emitMaintenanceSpineEvent(client, {
        operating_company_id: companyId,
        actor_user_id: user.uuid,
        event_type: "wo.completed",
        work_order_id: params.data.id,
      })
    ).catch((err) =>
      req.log.warn({ err, work_order_id: params.data.id, company_id: companyId }, "spine_emit_wo_completed_failed")
    );
    return { ok: true, work_order: result.row };
  });

  app.patch("/api/v1/maintenance/work-orders/:id/transition", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const parsed = transitionSchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const companyId = String((req.query as Record<string, unknown> | undefined)?.["operating_company_id"] ?? "");
    if (!companyId) return reply.code(400).send({ error: "operating_company_id_required" });

    const result = await withCompany(user.uuid, companyId, async (client) => {
      if (!(await maintenanceReady(client))) return { unavailable: true as const };
      const currentRes = await client.query(
        `SELECT status FROM maintenance.work_orders WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`,
        [params.data.id, companyId]
      );
      const current = currentRes.rows[0] as { status: z.infer<typeof workOrderStatusSchema> } | undefined;
      if (!current) return { notFound: true as const };
      if (!allowedTransitions[current.status as z.infer<typeof workOrderStatusSchema>].includes(parsed.data.new_status)) {
        return { invalid: true as const, from: current.status, to: parsed.data.new_status };
      }
      await client.query(`UPDATE maintenance.work_orders SET status = $2, updated_at = now() WHERE id = $1`, [
        params.data.id,
        parsed.data.new_status,
      ]);
      await client.query(
        `
          INSERT INTO maintenance.wo_status_history (work_order_id, from_status, to_status, changed_at, changed_by_user_id, notes)
          VALUES ($1,$2,$3,now(),$4,$5)
        `,
        [params.data.id, current.status, parsed.data.new_status, user.uuid, parsed.data.cancellation_reason ?? null]
      );
      await appendCrudAudit(
        client,
        user.uuid,
        "maintenance.work_order.status_transition",
        { resource_id: params.data.id, from_status: current.status, to_status: parsed.data.new_status },
        "info",
        "BT-3-MAINTENANCE-REBUILD"
      );
      if (CLOSED_STATUSES.has(parsed.data.new_status)) {
        const closedRes = await client.query(
          `SELECT closed_at::text, updated_at::text, status FROM maintenance.work_orders WHERE id = $1 LIMIT 1`,
          [params.data.id]
        );
        const closedRow = closedRes.rows[0] as { closed_at?: string | null; updated_at?: string | null; status?: string } | undefined;
        await appendCrudAudit(
          client,
          user.uuid,
          "maintenance.work_order.closed",
          {
            resource_type: "maintenance.work_orders",
            resource_id: params.data.id,
            operating_company_id: companyId,
            closed_at: closedRow?.closed_at ?? closedRow?.updated_at ?? new Date().toISOString(),
            status: closedRow?.status ?? parsed.data.new_status,
          },
          "info",
          "P5-D5-WO-TIME"
        );
      }
      return { ok: true as const };
    });

    if ("unavailable" in result) return reply.code(501).send({ error: "maintenance_schema_not_available" });
    if ("notFound" in result) return reply.code(404).send({ error: "work_order_not_found" });
    if ("invalid" in result) return reply.code(400).send({ error: "invalid_transition", from_status: result.from, to_status: result.to });
    void withCurrentUser(user.uuid, (client) =>
      emitMaintenanceSpineEvent(client, {
        operating_company_id: companyId,
        actor_user_id: user.uuid,
        event_type: "wo.status_changed",
        work_order_id: params.data.id,
        payload: { new_status: parsed.data.new_status },
      })
    ).catch((err) =>
      req.log.warn(
        { err, work_order_id: params.data.id, company_id: companyId, new_status: parsed.data.new_status },
        "spine_emit_wo_status_changed_failed"
      )
    );
    if (CLOSED_STATUSES.has(parsed.data.new_status)) {
      await processMaintenanceWorkOrderClose({
        operating_company_id: companyId,
        work_order_id: params.data.id,
        actor_user_id: user.uuid,
      });
    }
    return { ok: true };
  });

  app.post("/api/v1/maintenance/work-orders/:id/status", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const parsed = transitionSchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const companyId = String((req.query as Record<string, unknown> | undefined)?.["operating_company_id"] ?? "");
    if (!companyId) return reply.code(400).send({ error: "operating_company_id_required" });

    const result = await withCompany(user.uuid, companyId, async (client) => {
      if (!(await maintenanceReady(client))) return { unavailable: true as const };
      const currentRes = await client.query(
        `SELECT status FROM maintenance.work_orders WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`,
        [params.data.id, companyId]
      );
      const current = currentRes.rows[0] as { status: z.infer<typeof workOrderStatusSchema> } | undefined;
      if (!current) return { notFound: true as const };
      if (!allowedTransitions[current.status as z.infer<typeof workOrderStatusSchema>].includes(parsed.data.new_status)) {
        return { invalid: true as const, from: current.status, to: parsed.data.new_status };
      }
      await client.query(`UPDATE maintenance.work_orders SET status = $2, updated_at = now() WHERE id = $1`, [
        params.data.id,
        parsed.data.new_status,
      ]);
      await client.query(
        `
          INSERT INTO maintenance.wo_status_history (work_order_id, from_status, to_status, changed_at, changed_by_user_id, notes)
          VALUES ($1,$2,$3,now(),$4,$5)
        `,
        [params.data.id, current.status, parsed.data.new_status, user.uuid, parsed.data.cancellation_reason ?? null]
      );
      await appendCrudAudit(
        client,
        user.uuid,
        "maintenance.work_order.status_transition",
        { resource_id: params.data.id, from_status: current.status, to_status: parsed.data.new_status },
        "info",
        "BT-3-MAINTENANCE-REBUILD"
      );
      return { ok: true as const };
    });

    if ("unavailable" in result) return reply.code(501).send({ error: "maintenance_schema_not_available" });
    if ("notFound" in result) return reply.code(404).send({ error: "work_order_not_found" });
    if ("invalid" in result) return reply.code(400).send({ error: "invalid_transition", from_status: result.from, to_status: result.to });
    void withCurrentUser(user.uuid, (client) =>
      emitMaintenanceSpineEvent(client, {
        operating_company_id: companyId,
        actor_user_id: user.uuid,
        event_type: "wo.status_changed",
        work_order_id: params.data.id,
        payload: { new_status: parsed.data.new_status },
      })
    ).catch((err) =>
      req.log.warn(
        { err, work_order_id: params.data.id, company_id: companyId, new_status: parsed.data.new_status },
        "spine_emit_wo_status_changed_failed"
      )
    );
    return { ok: true };
  });

  app.post("/api/v1/maintenance/work-orders/:id/line-items", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const parsed = lineItemCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const companyId = String((req.query as Record<string, unknown> | undefined)?.["operating_company_id"] ?? "");
    if (!companyId) return reply.code(400).send({ error: "operating_company_id_required" });

    let row: Record<string, unknown> | null | undefined;
    try {
      row = await withCompany(user.uuid, companyId, async (client) => {
        if (!(await maintenanceReady(client))) return null;
        const wo = await client.query(`SELECT id FROM maintenance.work_orders WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`, [
          params.data.id,
          companyId,
        ]);
        if (wo.rowCount === 0) return undefined;
        // FINANCIAL GUARD: a WO cost line feeds the linked Bill/Expense. If that AP document is
        // already posted/paid, adding a cost line would diverge the WO from its Bill — refuse.
        const posted = await findPostedApForWo(client, companyId, params.data.id);
        if (posted) throw new WoPostedApError(posted);
        const res = await client.query(
          `
            INSERT INTO maintenance.work_order_lines (work_order_uuid, line_type, description, quantity, unit_cost, total_cost)
            VALUES ($1,$2,$3,$4,$5,$6)
            RETURNING *
          `,
          [params.data.id, parsed.data.line_type, parsed.data.description, parsed.data.quantity, parsed.data.unit_cost, parsed.data.amount]
        );
        await validateWoVendorInvoiceTotals(client, String(params.data.id));
        return res.rows[0];
      });
    } catch (error) {
      if (isWoPostedApError(error)) return postedApReply(reply, error.detail);
      if (isWoInvoiceMismatch(error)) {
        const err = error;
        return reply.code(409).send({
          error: err.code,
          total_line_items_cents: err.total_line_items_cents,
          vendor_invoice_cents: err.vendor_invoice_cents,
          delta_cents: err.delta_cents,
          source: err.source,
        });
      }
      throw error;
    }
    if (row === null) return reply.code(501).send({ error: "maintenance_schema_not_available" });
    if (row === undefined) return reply.code(404).send({ error: "work_order_not_found" });
    void withCurrentUser(user.uuid, (client) =>
      emitMaintenanceSpineEvent(client, {
        operating_company_id: companyId,
        actor_user_id: user.uuid,
        event_type: "wo.line_item_added",
        work_order_id: params.data.id,
        payload: { line_type: parsed.data.line_type },
      })
    ).catch((err) =>
      req.log.warn(
        { err, work_order_id: params.data.id, company_id: companyId },
        "spine_emit_wo_line_item_added_failed"
      )
    );
    return reply.code(201).send(row);
  });

  app.delete("/api/v1/maintenance/work-orders/:id/line-items/:lid", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = lineItemParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const companyId = String((req.query as Record<string, unknown> | undefined)?.["operating_company_id"] ?? "");
    if (!companyId) return reply.code(400).send({ error: "operating_company_id_required" });

    let deleted: boolean | null;
    try {
      deleted = await withCompany(user.uuid, companyId, async (client) => {
        if (!(await maintenanceReady(client))) return null;
        // FINANCIAL GUARD: removing a cost line from a WO whose Bill/Expense is already posted would
        // diverge the WO from its AP document — refuse and tell the user to void the bill first.
        const posted = await findPostedApForWo(client, companyId, params.data.id);
        if (posted) throw new WoPostedApError(posted);
        const res = await client.query(
          `
            -- MNT-PHANTOM-03: this matched on li.id. maintenance.work_order_lines has NO id column
            -- (prod: 0) — its primary key is the uuid column. So this DELETE threw 42703 on every call, and
            -- WO cost-line removal endpoint has never once executed. The posted-bill refusal above it
            -- (WoPostedApError) was therefore also never reached in anger.
            -- NOTE for F9-06: there is no working hard-delete here to "convert" to a soft-retire —
            -- the endpoint must first be made to run at all. Sequencing recorded in the PR body.
            DELETE FROM maintenance.work_order_lines li
            USING maintenance.work_orders w
            WHERE li.uuid = $1
              AND li.work_order_uuid = w.id
              AND w.id = $2
              AND w.operating_company_id = $3::uuid
            RETURNING li.uuid
          `,
          [params.data.lid, params.data.id, companyId]
        );
        const ok = Boolean(res.rowCount && res.rowCount > 0);
        if (ok) await validateWoVendorInvoiceTotals(client, String(params.data.id));
        return ok;
      });
    } catch (error) {
      if (isWoPostedApError(error)) return postedApReply(reply, error.detail);
      if (isWoInvoiceMismatch(error)) {
        const err = error;
        return reply.code(409).send({
          error: err.code,
          total_line_items_cents: err.total_line_items_cents,
          vendor_invoice_cents: err.vendor_invoice_cents,
          delta_cents: err.delta_cents,
          source: err.source,
        });
      }
      throw error;
    }
    if (deleted === null) return reply.code(501).send({ error: "maintenance_schema_not_available" });
    if (!deleted) return reply.code(404).send({ error: "line_item_not_found" });
    void withCurrentUser(user.uuid, (client) =>
      emitMaintenanceSpineEvent(client, {
        operating_company_id: companyId,
        actor_user_id: user.uuid,
        event_type: "wo.line_item_removed",
        work_order_id: params.data.id,
        payload: { line_item_id: params.data.lid },
      })
    ).catch((err) =>
      req.log.warn(
        { err, work_order_id: params.data.id, company_id: companyId },
        "spine_emit_wo_line_item_removed_failed"
      )
    );
    return reply.code(204).send();
  });
}
