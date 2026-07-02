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
import { assertRoadsideFields, listWorkOrdersByBucket } from "./work-orders.service.js";
import { emitMaintenanceSpineEvent } from "./maintenance-spine-emit.js";
import { isWoInvoiceMismatch, validateWoVendorInvoiceTotals } from "./wo-cost-validation.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

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
  service_item_uuid: z.string().uuid(),
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
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
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
      const where: string[] = ["w.operating_company_id = $1"];
      // MAINT-1: hide DEMO-/TEST- seed work orders (e.g. DEMO-WO-001) from the live Maintenance WO
      // list. Applied to the shared `where` so both the count and the rows exclude them. Read-only —
      // the WO rows stay in maintenance.work_orders (void-not-delete), just hidden from live views.
      where.push("COALESCE(w.display_id, '') NOT ILIKE 'DEMO-%'");
      where.push("COALESCE(w.display_id, '') NOT ILIKE 'TEST-%'");
      if (q.status) {
        values.push(q.status);
        where.push(`w.status = $${values.length}`);
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
        `SELECT w.*, u.unit_number
           FROM maintenance.work_orders w
           LEFT JOIN mdata.units u
             ON u.id = w.unit_id
            AND (u.owner_company_id = w.operating_company_id
                 OR u.currently_leased_to_company_id = w.operating_company_id)
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
      const wo = await client.query(`SELECT * FROM maintenance.work_orders WHERE id = $1 AND operating_company_id = $2 LIMIT 1`, [
        params.data.id,
        companyId,
      ]);
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
      let where = "operating_company_id = $1 AND is_active = true";
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
            const vr = await client.query(
              `SELECT 1 FROM mdata.qbo_vendors WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
              [body.header.vendor_id, body.header.operating_company_id]
            );
            if ((vr.rowCount ?? 0) === 0) {
              return { kind: "bad_vendor" as const };
            }
          }
          await client.query("BEGIN");
          try {
            const created = await createWorkOrderWithLines(client as never, user.uuid, body.header, body.sectionA, body.sectionB);
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
        ).catch(() => undefined);
        return reply.code(201).send(result);
      } catch (error) {
        if (isWoInvoiceMismatch(error)) {
          return reply.code(409).send({
            error: error.code,
            total_line_items_cents: error.total_line_items_cents,
            vendor_invoice_cents: error.vendor_invoice_cents,
            delta_cents: error.delta_cents,
            source: error.source,
          });
        }
        const message = String((error as Error)?.message ?? "");
        if (message.includes("E_DIESEL_REQUIRES_LOAD")) {
          return reply.code(422).send({
            error: "E_DIESEL_REQUIRES_LOAD",
            message: "Diesel/over-the-road expenses must link to a load (G18 invariant)",
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
      const wo = woRes.rows[0];

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
      const currentRes = await client.query(`SELECT * FROM maintenance.work_orders WHERE id = $1 AND operating_company_id = $2 LIMIT 1`, [
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
      const updatedRes = await client.query(
        `
          UPDATE maintenance.work_orders
          SET
            external_vendor_id = COALESCE($2, external_vendor_id),
            external_vendor_wo_number = COALESCE($3, external_vendor_wo_number),
            external_vendor_invoice_number = COALESCE($4, external_vendor_invoice_number),
            description = COALESCE($5, description),
            bucket = COALESCE($6::maintenance.wo_bucket_enum, bucket),
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
        ]
      );
      const updated = updatedRes.rows[0];
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
      const currentRes = await client.query(`SELECT * FROM maintenance.work_orders WHERE id = $1 AND operating_company_id = $2 LIMIT 1`, [
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
      if (!d) return reply.code(409).send({ error: "WO_INVOICE_MISMATCH" });
      return reply.code(409).send({
        error: d.code,
        total_line_items_cents: d.total_line_items_cents,
        vendor_invoice_cents: d.vendor_invoice_cents,
        delta_cents: d.delta_cents,
        source: d.source,
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
    ).catch(() => undefined);
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
        `SELECT status FROM maintenance.work_orders WHERE id = $1 AND operating_company_id = $2 LIMIT 1`,
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
    ).catch(() => undefined);
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
        `SELECT status FROM maintenance.work_orders WHERE id = $1 AND operating_company_id = $2 LIMIT 1`,
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
    ).catch(() => undefined);
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
        const wo = await client.query(`SELECT id FROM maintenance.work_orders WHERE id = $1 AND operating_company_id = $2 LIMIT 1`, [
          params.data.id,
          companyId,
        ]);
        if (wo.rowCount === 0) return undefined;
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
    ).catch(() => undefined);
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
        const res = await client.query(
          `
            DELETE FROM maintenance.work_order_lines li
            USING maintenance.work_orders w
            WHERE li.id = $1
              AND li.work_order_uuid = w.id
              AND w.id = $2
              AND w.operating_company_id = $3
            RETURNING li.id
          `,
          [params.data.lid, params.data.id, companyId]
        );
        const ok = Boolean(res.rowCount && res.rowCount > 0);
        if (ok) await validateWoVendorInvoiceTotals(client, String(params.data.id));
        return ok;
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
    ).catch(() => undefined);
    return reply.code(204).send();
  });
}
