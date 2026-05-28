import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { companyQuerySchema, validationError, withCompanyScope } from "../accounting/shared.js";
import { mapMaintWoApHttpError, processMaintWorkOrderApPosting } from "../maint/wo-ap-posting.service.js";
import { enqueueEmail } from "../email/queue.service.js";
import { requireAuth } from "../auth/session-middleware.js";
import { autoCreateBillFromWO } from "../maintenance/two-section-service.js";
import { generatePresignedUploadUrl, isR2Configured } from "../storage/r2-client.js";
import {
  mapServiceClassToOperationalWoType,
  resolveVendorReferences,
  validateCreateWorkOrder,
  validateUpdateWorkOrder,
} from "./validation.service.js";
import { generateWorkOrderNumber } from "./wo-number.service.js";
import { renderWorkOrderPdfHtml, type WorkOrderPdfModel } from "./wo-pdf-renderer.service.js";

const idParamsSchema = z.object({ id: z.string().uuid() });

const woServiceClassSchema = z.enum([
  "pm",
  "corrective",
  "accident",
  "inspection_dot",
  "inspection_state",
  "warranty",
  "other",
]);

const createWorkOrderBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  wo_billing_type: z.enum(["internal", "external"]),
  wo_service_class: woServiceClassSchema,
  unit_id: z.string().uuid().optional().nullable(),
  driver_id: z.string().uuid().optional().nullable(),
  vendor_id: z.string().uuid().optional().nullable(),
  vendor_qbo_id: z.string().trim().max(120).optional().nullable(),
  shop_name: z.string().trim().max(200).optional().nullable(),
  shop_address: z.string().trim().max(400).optional().nullable(),
  shop_phone: z.string().trim().max(80).optional().nullable(),
  vendor_invoice_number: z.string().trim().max(120).optional().nullable(),
  vendor_work_order_number: z.string().trim().max(120).optional().nullable(),
  linked_load_id: z.string().uuid().optional().nullable(),
  description: z.string().trim().min(1).max(4000),
  estimated_cost_cents: z.number().int().min(0).optional(),
  actual_cost_cents: z.number().int().min(0).optional(),
  labor_hours: z.number().min(0).optional(),
  parts_cost_cents: z.number().int().min(0).optional(),
  notes_internal: z.string().trim().max(4000).optional().nullable(),
  notes_to_vendor: z.string().trim().max(4000).optional().nullable(),
});

const patchWorkOrderBodySchema = createWorkOrderBodySchema.partial().omit({ operating_company_id: true }).extend({
  linked_load_id: z.string().uuid().nullable().optional(),
});

const listQuerySchema = companyQuerySchema.extend({
  status: z.enum(["all", "open", "in_progress", "completed", "cancelled"]).default("all"),
  wo_billing_type: z.enum(["internal", "external"]).optional(),
  wo_service_class: woServiceClassSchema.optional(),
  unit_id: z.string().uuid().optional(),
  driver_id: z.string().uuid().optional(),
  search: z.string().trim().max(160).optional(),
  sort: z.enum(["created_desc", "cost_desc", "wo_number_asc", "labor_cost_desc"]).default("created_desc"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const cancelBodySchema = z.object({
  cancellation_reason: z.string().trim().max(500).optional(),
});

const photoIntentSchema = z.object({
  content_type: z.string().trim().min(3).max(120).default("application/octet-stream"),
});

const appendPhotoSchema = z.object({
  object_key: z.string().trim().min(3).max(500),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function officeWoRoles(role: string) {
  return ["Owner", "Administrator", "Manager", "Dispatcher", "Safety"].includes(role);
}

async function maintenanceReady(client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<{ ok?: boolean }> }> }) {
  const res = await client.query(`SELECT to_regclass('maintenance.work_orders') IS NOT NULL AS ok`);
  return Boolean(res.rows[0]?.ok);
}

async function woTimeEntriesReady(client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<{ ok?: boolean }> }> }) {
  const res = await client.query(`SELECT to_regclass('maintenance.wo_time_entries') IS NOT NULL AS ok`);
  return Boolean(res.rows[0]?.ok);
}

async function enqueueWorkOrderOutbox(
  client: { query: (sql: string, values?: unknown[]) => Promise<unknown> },
  eventType: string,
  payload: Record<string, unknown>
) {
  /* outbox-handler-parity: literal-types=["work_order.created","work_order.updated","work_order.approved","work_order.started","work_order.completed","accounting.bill.auto_created_from_wo","work_order.cancelled","work_order.photo_added"] */
  await client.query(`INSERT INTO outbox.events (event_type, payload, next_retry_at) VALUES ($1, $2::jsonb, now())`, [
    eventType,
    JSON.stringify(payload),
  ]);
}

function centsFromNumeric(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function buildPdfModel(params: {
  company: Record<string, unknown>;
  wo: Record<string, unknown>;
  unit: Record<string, unknown> | null;
  driver: Record<string, unknown> | null;
}): WorkOrderPdfModel {
  const { company, wo, unit, driver } = params;
  const legalName = String(company.legal_name ?? company.short_name ?? "Carrier");
  const ein = company.tax_id ? `EIN ${String(company.tax_id)}` : "Motor carrier identifiers on file";

  const unitLabel = String(unit?.display_id ?? unit?.unit_number ?? "").trim() || null;
  const unitDetailParts = [unit?.make, unit?.model, unit?.model_year, unit?.vin]
    .map((part) => (part === null || part === undefined ? "" : String(part).trim()))
    .filter(Boolean);
  const unitDetail = unitDetailParts.length > 0 ? unitDetailParts.join(" · ") : null;

  const driverName =
    driver?.first_name || driver?.last_name
      ? `${String(driver?.first_name ?? "").trim()} ${String(driver?.last_name ?? "").trim()}`.trim()
      : null;
  const driverPhone = String(driver?.phone_mobile ?? driver?.phone ?? driver?.mobile_phone ?? "").trim() || null;

  const { vendor_invoice_number, vendor_work_order_number } = resolveVendorReferences({
    wo_billing_type: String(wo.wo_billing_type ?? "external") as "internal" | "external",
    wo_service_class: String(wo.wo_service_class ?? "corrective") as z.infer<typeof woServiceClassSchema>,
    vendor_invoice_number: wo.vendor_invoice_number as string | null,
    vendor_work_order_number: wo.vendor_work_order_number as string | null,
    external_vendor_invoice_number: wo.external_vendor_invoice_number as string | null,
    external_vendor_wo_number: wo.external_vendor_wo_number as string | null,
  });

  const actualFromNumeric = centsFromNumeric(wo.total_actual_cost);
  const estimatedTotalCents =
    wo.estimated_cost_cents !== null && wo.estimated_cost_cents !== undefined ? Number(wo.estimated_cost_cents) : null;
  const actualTotalCents =
    wo.actual_cost_cents !== null && wo.actual_cost_cents !== undefined ? Number(wo.actual_cost_cents) : actualFromNumeric;

  const partsCost =
    wo.parts_cost_cents !== null && wo.parts_cost_cents !== undefined ? Number(wo.parts_cost_cents) : null;
  const laborHours = wo.labor_hours !== null && wo.labor_hours !== undefined ? Number(wo.labor_hours) : null;

  let laborRateCents: number | null = null;
  if (laborHours && laborHours > 0 && estimatedTotalCents !== null && partsCost !== null) {
    const laborTotal = estimatedTotalCents - partsCost;
    if (laborTotal > 0) {
      laborRateCents = Math.round(laborTotal / laborHours);
    }
  }

  let otherCostCents: number | null = null;
  if (estimatedTotalCents !== null && partsCost !== null && laborHours !== null && laborRateCents !== null) {
    otherCostCents = Math.max(0, estimatedTotalCents - partsCost - Math.round(laborHours * laborRateCents));
  }

  const isCompleted = String(wo.status ?? "") === "complete";

  return {
    companyLegalName: legalName,
    companyMcDotEinLine: ein,
    woNumber: String(wo.display_id ?? wo.id ?? "WO"),
    issuedAt: (wo.opened_at as string | undefined) ?? (wo.created_at as string | undefined) ?? new Date(),
    woBillingType: wo.wo_billing_type ? String(wo.wo_billing_type) : null,
    woServiceClass: wo.wo_service_class ? String(wo.wo_service_class) : null,
    status: wo.status ? String(wo.status) : null,
    unitLabel,
    unitDetail,
    driverName,
    driverPhone,
    linkedLoadNumber: wo.linked_load_number ? String(wo.linked_load_number) : null,
    shopName: wo.shop_name ? String(wo.shop_name) : null,
    shopAddress: wo.shop_address ? String(wo.shop_address) : null,
    shopPhone: wo.shop_phone ? String(wo.shop_phone) : null,
    vendorInvoiceNumber: vendor_invoice_number || null,
    vendorWorkOrderNumber: vendor_work_order_number || null,
    description: wo.description ? String(wo.description) : null,
    notesToVendor: wo.notes_to_vendor ? String(wo.notes_to_vendor) : null,
    laborHours,
    laborRateCents,
    partsCostCents: partsCost,
    otherCostCents,
    estimatedTotalCents,
    actualTotalCents,
    isCompleted,
  };
}

export async function registerWorkOrdersV1Routes(app: FastifyInstance) {
  app.get("/api/v1/work-orders", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const q = parsed.data;

    const payload = await withCompanyScope(user.uuid, q.operating_company_id, async (client) => {
      if (!(await maintenanceReady(client))) {
        return null;
      }

      const values: unknown[] = [q.operating_company_id];
      const where: string[] = ["w.operating_company_id = $1"];

      if (q.wo_billing_type) {
        values.push(q.wo_billing_type);
        where.push(`w.wo_billing_type = $${values.length}`);
      }
      if (q.wo_service_class) {
        values.push(q.wo_service_class);
        where.push(`w.wo_service_class = $${values.length}`);
      }
      if (q.unit_id) {
        values.push(q.unit_id);
        where.push(`w.unit_id = $${values.length}`);
      }
      if (q.driver_id) {
        values.push(q.driver_id);
        where.push(`w.driver_id = $${values.length}`);
      }
      if (q.search) {
        values.push(`%${q.search}%`);
        const needleIdx = values.length;
        where.push(
          `(
              COALESCE(w.display_id, '') ILIKE $${needleIdx}
              OR COALESCE(w.description, '') ILIKE $${needleIdx}
              OR COALESCE(w.shop_name, '') ILIKE $${needleIdx}
              OR EXISTS (
                SELECT 1 FROM mdata.units u
                WHERE u.id = w.unit_id AND COALESCE(u.unit_number, '') ILIKE $${needleIdx}
              )
              OR EXISTS (
                SELECT 1 FROM mdata.drivers d
                WHERE d.id = w.driver_id AND (
                  COALESCE(d.first_name, '') ILIKE $${needleIdx}
                  OR COALESCE(d.last_name, '') ILIKE $${needleIdx}
                )
              )
            )`
        );
      }

      const segmentClause =
        q.status === "all"
          ? ""
          : q.status === "open"
            ? ` AND w.status = 'open'`
            : q.status === "in_progress"
              ? ` AND w.status IN ('in_progress','waiting_parts')`
              : q.status === "completed"
                ? ` AND w.status = 'complete'`
                : ` AND w.status = 'cancelled'`;

      const timeReady = await woTimeEntriesReady(client);
      const laborJoin = timeReady
        ? `
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(computed_labor_cost_cents), 0)::bigint AS labor_cost_cents
          FROM maintenance.wo_time_entries te
          WHERE te.work_order_id = w.id
            AND te.deleted_at IS NULL
            AND te.computed_labor_cost_cents IS NOT NULL
        ) te_agg ON TRUE`
        : "";
      const laborSelect = timeReady ? `, COALESCE(te_agg.labor_cost_cents, 0)::bigint AS labor_cost_cents` : `, 0::bigint AS labor_cost_cents`;

      const orderBy =
        q.sort === "cost_desc"
          ? `ORDER BY COALESCE(
               w.actual_cost_cents::numeric / 100.0,
               w.total_actual_cost,
               w.estimated_cost_cents::numeric / 100.0,
               0
             ) DESC NULLS LAST, w.created_at DESC`
          : q.sort === "wo_number_asc"
            ? "ORDER BY w.display_id ASC NULLS LAST, w.created_at DESC"
            : q.sort === "labor_cost_desc" && timeReady
              ? "ORDER BY COALESCE(te_agg.labor_cost_cents, 0) DESC NULLS LAST, w.created_at DESC"
              : "ORDER BY w.created_at DESC";

      const countSql = `
        SELECT
          COUNT(*) FILTER (WHERE TRUE) AS cnt_all,
          COUNT(*) FILTER (WHERE w.status = 'open') AS cnt_open,
          COUNT(*) FILTER (WHERE w.status IN ('in_progress','waiting_parts')) AS cnt_in_progress,
          COUNT(*) FILTER (WHERE w.status = 'complete') AS cnt_completed,
          COUNT(*) FILTER (WHERE w.status = 'cancelled') AS cnt_cancelled
        FROM maintenance.work_orders w
        WHERE ${where.join(" AND ")}
      `;
      const countsRes = await client.query(countSql, values);
      const counts = countsRes.rows[0] as Record<string, unknown>;

      values.push(q.limit, q.offset);
      const limitIdx = values.length - 1;
      const offsetIdx = values.length;
      const rowsRes = await client.query(
        `
          SELECT w.*${laborSelect}
          FROM maintenance.work_orders w
          ${laborJoin}
          WHERE ${where.join(" AND ")}${segmentClause}
          ${orderBy}
          LIMIT $${limitIdx} OFFSET $${offsetIdx}
        `,
        values
      );

      return {
        work_orders: rowsRes.rows,
        tab_counts: {
          all: Number(counts.cnt_all ?? 0),
          open: Number(counts.cnt_open ?? 0),
          in_progress: Number(counts.cnt_in_progress ?? 0),
          completed: Number(counts.cnt_completed ?? 0),
          cancelled: Number(counts.cnt_cancelled ?? 0),
        },
        limit: q.limit,
        offset: q.offset,
      };
    });
    if (!payload) return reply.code(501).send({ error: "maintenance_schema_not_available" });
    return payload;
  });

  app.get("/api/v1/work-orders/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      if (!(await maintenanceReady(client))) return { kind: "unavailable" as const };
      const woRes = await client.query(`SELECT * FROM maintenance.work_orders WHERE id = $1 AND operating_company_id = $2 LIMIT 1`, [
        params.data.id,
        query.data.operating_company_id,
      ]);
      const wo = woRes.rows[0];
      if (!wo) return { kind: "missing" as const };
      let laborCostCents = 0;
      if (await woTimeEntriesReady(client)) {
        const laborRes = await client.query(
          `
            SELECT COALESCE(SUM(computed_labor_cost_cents), 0)::bigint AS cents
            FROM maintenance.wo_time_entries
            WHERE work_order_id = $1
              AND operating_company_id = $2
              AND deleted_at IS NULL
          `,
          [params.data.id, query.data.operating_company_id]
        );
        laborCostCents = Number(laborRes.rows[0]?.cents ?? 0);
      }

      const woOut = { ...(wo as Record<string, unknown>), labor_cost_cents: laborCostCents };

      const lines = await client.query(`SELECT * FROM maintenance.work_order_lines WHERE work_order_id = $1 ORDER BY created_at ASC`, [
        params.data.id,
      ]);
      const history = await client.query(`SELECT * FROM maintenance.wo_status_history WHERE work_order_id = $1 ORDER BY created_at ASC`, [
        params.data.id,
      ]);
      return { kind: "ok" as const, wo: woOut, lines: lines.rows, history: history.rows };
    });

    if ("kind" in payload && payload.kind === "unavailable") return reply.code(501).send({ error: "maintenance_schema_not_available" });
    if ("kind" in payload && payload.kind === "missing") return reply.code(404).send({ error: "work_order_not_found" });
    return { work_order: payload.wo, line_items: payload.lines, status_history: payload.history };
  });

  app.post("/api/v1/work-orders", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!officeWoRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const parsed = createWorkOrderBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const body = parsed.data;

    const validation = validateCreateWorkOrder({
      wo_billing_type: body.wo_billing_type,
      wo_service_class: body.wo_service_class,
      unit_id: body.unit_id ?? null,
      driver_id: body.driver_id ?? null,
      vendor_id: body.vendor_id ?? null,
      shop_name: body.shop_name ?? null,
      vendor_invoice_number: body.vendor_invoice_number ?? null,
      vendor_work_order_number: body.vendor_work_order_number ?? null,
    });
    if (!validation.ok) return reply.code(400).send({ error: "validation_failed", errors: validation.errors });

    try {
      const created = await withCompanyScope(user.uuid, body.operating_company_id, async (client) => {
        if (!(await maintenanceReady(client))) return { kind: "unavailable" as const };

        if (body.vendor_id) {
          const vr = await client.query(
            `SELECT 1 FROM mdata.qbo_vendors WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
            [body.vendor_id, body.operating_company_id]
          );
          if ((vr.rowCount ?? 0) === 0) return { kind: "bad_vendor" as const };
        }

        await client.query("BEGIN");
        try {
          const displayId = await generateWorkOrderNumber(client, {
            operatingCompanyId: body.operating_company_id,
            linkedLoadId: body.linked_load_id ?? undefined,
          });
          const operationalType = mapServiceClassToOperationalWoType(body.wo_service_class);
          const bucket = body.wo_billing_type === "internal" ? "in_house" : "external";
          const { vendor_invoice_number, vendor_work_order_number } = resolveVendorReferences({
            wo_billing_type: body.wo_billing_type,
            wo_service_class: body.wo_service_class,
            vendor_invoice_number: body.vendor_invoice_number ?? null,
            vendor_work_order_number: body.vendor_work_order_number ?? null,
          });

          const linkedLoadRes = body.linked_load_id
            ? await client.query(`SELECT load_number FROM mdata.loads WHERE id = $1 LIMIT 1`, [body.linked_load_id])
            : { rows: [] as Array<{ load_number?: string | null }> };
          const linkedLoadNumber = linkedLoadRes.rows[0]?.load_number ? String(linkedLoadRes.rows[0].load_number) : null;

          const insertRes = await client.query(
            `
              INSERT INTO maintenance.work_orders (
                operating_company_id,
                wo_type,
                source_type,
                status,
                unit_id,
                driver_id,
                load_id,
                opened_at,
                repair_location,
                description,
                external_vendor_id,
                external_vendor_wo_number,
                external_vendor_invoice_number,
                display_id,
                unit_sequence,
                total_actual_cost,
                bucket,
                wo_billing_type,
                wo_service_class,
                vendor_work_order_number,
                estimated_cost_cents,
                actual_cost_cents,
                labor_hours,
                parts_cost_cents,
                shop_name,
                shop_address,
                shop_phone,
                notes_internal,
                notes_to_vendor,
                linked_load_number,
                vendor_id,
                vendor_qbo_id
              ) VALUES (
                $1,$2,'IS','open',$3,$4,$5,now(),'in_house',$6,NULL,$7,$8,$9,0,NULL,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25
              )
              RETURNING *
            `,
            [
              body.operating_company_id,
              operationalType,
              body.unit_id ?? null,
              body.driver_id ?? null,
              body.linked_load_id ?? null,
              body.description,
              vendor_work_order_number || null,
              vendor_invoice_number || null,
              displayId,
              bucket,
              body.wo_billing_type,
              body.wo_service_class,
              vendor_work_order_number || null,
              body.estimated_cost_cents ?? 0,
              body.actual_cost_cents ?? null,
              body.labor_hours ?? null,
              body.parts_cost_cents ?? null,
              body.shop_name ?? null,
              body.shop_address ?? null,
              body.shop_phone ?? null,
              body.notes_internal ?? null,
              body.notes_to_vendor ?? null,
              linkedLoadNumber,
              body.vendor_id ?? null,
              body.vendor_qbo_id ?? null,
            ]
          );

          const wo = insertRes.rows[0];

          await client.query(
            `
              INSERT INTO maintenance.wo_status_history (work_order_id, from_status, to_status, changed_at, changed_by_user_id, notes)
              VALUES ($1, NULL, 'open', now(), $2, $3)
            `,
            [wo.id, user.uuid, "Created via /api/v1/work-orders"]
          );

          await appendCrudAudit(client, user.uuid, "maintenance.wo.created", { resource_id: wo.id, display_id: wo.display_id }, "info", "P6-T11179");
          await enqueueWorkOrderOutbox(client, "work_order.created", {
            work_order_id: wo.id,
            operating_company_id: body.operating_company_id,
            display_id: wo.display_id,
          });

          await client.query("COMMIT");
          return { kind: "ok" as const, wo };
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      });

      if ("kind" in created && created.kind === "unavailable") return reply.code(501).send({ error: "maintenance_schema_not_available" });
      if ("kind" in created && created.kind === "bad_vendor") {
        return reply.code(400).send({
          error: "invalid_vendor_id",
          message: "vendor_id must reference a synced QuickBooks vendor for this operating company",
        });
      }
      return reply.code(201).send({ work_order: created.wo });
    } catch (error) {
      const message = String((error as Error)?.message ?? "create_failed");
      return reply.code(400).send({ error: "work_order_create_failed", message });
    }
  });

  app.patch("/api/v1/work-orders/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!officeWoRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const parsed = patchWorkOrderBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const body = parsed.data;

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      if (!(await maintenanceReady(client))) return { kind: "unavailable" as const };
      const currentRes = await client.query(`SELECT * FROM maintenance.work_orders WHERE id = $1 LIMIT 1`, [params.data.id]);
      const prior = currentRes.rows[0];
      if (!prior || String(prior.operating_company_id) !== query.data.operating_company_id) return { kind: "missing" as const };

      if (body.vendor_id) {
        const vr = await client.query(
          `SELECT 1 FROM mdata.qbo_vendors WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
          [body.vendor_id, query.data.operating_company_id]
        );
        if ((vr.rowCount ?? 0) === 0) return { kind: "bad_vendor" as const };
      }

      const mergedPatch = {
        wo_billing_type: body.wo_billing_type ?? undefined,
        wo_service_class: body.wo_service_class ?? undefined,
        unit_id: body.unit_id ?? undefined,
        driver_id: body.driver_id ?? undefined,
        vendor_id: body.vendor_id ?? undefined,
        shop_name: body.shop_name ?? undefined,
        vendor_invoice_number: body.vendor_invoice_number ?? undefined,
        vendor_work_order_number: body.vendor_work_order_number ?? undefined,
        external_vendor_invoice_number: prior.external_vendor_invoice_number as string | null,
        external_vendor_wo_number: prior.external_vendor_wo_number as string | null,
      };

      const validation = validateUpdateWorkOrder(
        {
          wo_billing_type: prior.wo_billing_type as "internal" | "external" | undefined,
          wo_service_class: prior.wo_service_class as z.infer<typeof woServiceClassSchema> | undefined,
          unit_id: prior.unit_id as string | null,
          driver_id: prior.driver_id as string | null,
          vendor_id:
            (prior.vendor_id as string | null) ??
            (prior.assigned_vendor as string | null) ??
            (prior.external_vendor_id as string | null),
          shop_name: prior.shop_name as string | null,
          vendor_invoice_number: prior.vendor_invoice_number as string | null,
          vendor_work_order_number: prior.vendor_work_order_number as string | null,
          external_vendor_invoice_number: prior.external_vendor_invoice_number as string | null,
          external_vendor_wo_number: prior.external_vendor_wo_number as string | null,
        },
        mergedPatch
      );
      if (!validation.ok) return { kind: "invalid" as const, errors: validation.errors };

      const sets: string[] = [];
      const vals: unknown[] = [];
      let idx = 1;
      const push = (fragment: string, value: unknown) => {
        sets.push(fragment.replace(/\$IDX/g, `$${idx}`));
        vals.push(value);
        idx += 1;
      };

      if (body.description !== undefined) push(`description = $IDX`, body.description);
      if (body.notes_internal !== undefined) push(`notes_internal = $IDX`, body.notes_internal);
      if (body.notes_to_vendor !== undefined) push(`notes_to_vendor = $IDX`, body.notes_to_vendor);
      if (body.shop_name !== undefined) push(`shop_name = $IDX`, body.shop_name);
      if (body.shop_address !== undefined) push(`shop_address = $IDX`, body.shop_address);
      if (body.shop_phone !== undefined) push(`shop_phone = $IDX`, body.shop_phone);
      if (body.unit_id !== undefined) push(`unit_id = $IDX`, body.unit_id);
      if (body.driver_id !== undefined) push(`driver_id = $IDX`, body.driver_id);
      if (body.linked_load_id !== undefined) {
        push(`load_id = $IDX`, body.linked_load_id);
        if (body.linked_load_id) {
          const loadRow = await client.query(`SELECT load_number FROM mdata.loads WHERE id = $1 LIMIT 1`, [body.linked_load_id]);
          push(`linked_load_number = $IDX`, loadRow.rows[0]?.load_number ?? null);
        } else {
          push(`linked_load_number = $IDX`, null);
        }
      }
      if (body.wo_billing_type !== undefined) {
        push(`wo_billing_type = $IDX`, body.wo_billing_type);
        push(`bucket = $IDX`, body.wo_billing_type === "internal" ? "in_house" : "external");
      }
      if (body.wo_service_class !== undefined) {
        push(`wo_service_class = $IDX`, body.wo_service_class);
        push(`wo_type = $IDX`, mapServiceClassToOperationalWoType(body.wo_service_class));
      }
      if (body.vendor_invoice_number !== undefined) {
        push(`external_vendor_invoice_number = $IDX`, body.vendor_invoice_number);
      }
      if (body.vendor_work_order_number !== undefined) {
        push(`vendor_work_order_number = $IDX`, body.vendor_work_order_number);
        push(`external_vendor_wo_number = $IDX`, body.vendor_work_order_number);
      }
      if (body.vendor_id !== undefined) push(`vendor_id = $IDX`, body.vendor_id);
      if (body.vendor_qbo_id !== undefined) push(`vendor_qbo_id = $IDX`, body.vendor_qbo_id);
      if (body.estimated_cost_cents !== undefined) {
        push(`estimated_cost_cents = $IDX`, body.estimated_cost_cents);
      }
      if (body.actual_cost_cents !== undefined) {
        push(`actual_cost_cents = $IDX`, body.actual_cost_cents);
      }
      if (body.labor_hours !== undefined) push(`labor_hours = $IDX`, body.labor_hours);
      if (body.parts_cost_cents !== undefined) push(`parts_cost_cents = $IDX`, body.parts_cost_cents);

      if (sets.length === 0) return { kind: "ok" as const, wo: prior };

      vals.push(params.data.id);
      const updateSql = `
        UPDATE maintenance.work_orders
        SET ${sets.join(", ")}, updated_at = now()
        WHERE id = $${idx}
        RETURNING *
      `;
      const updated = await client.query(updateSql, vals);
      const wo = updated.rows[0];
      await appendCrudAudit(client, user.uuid, "maintenance.work_order.updated", { resource_id: wo.id }, "info", "P6-T11179");
      await enqueueWorkOrderOutbox(client, "work_order.updated", { work_order_id: wo.id });
      return { kind: "ok" as const, wo };
    });

    if (result.kind === "unavailable") return reply.code(501).send({ error: "maintenance_schema_not_available" });
    if (result.kind === "missing") return reply.code(404).send({ error: "work_order_not_found" });
    if (result.kind === "invalid") return reply.code(400).send({ error: "validation_failed", errors: result.errors });
    return { work_order: result.wo };
  });

  app.post("/api/v1/work-orders/:id/approve", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!officeWoRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const row = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      if (!(await maintenanceReady(client))) return { kind: "unavailable" as const };
      const res = await client.query(
        `
          UPDATE maintenance.work_orders
          SET approved_at = COALESCE(approved_at, now()),
              approved_by_user_id = COALESCE(approved_by_user_id, $2),
              updated_at = now()
          WHERE id = $1 AND operating_company_id = $3
          RETURNING *
        `,
        [params.data.id, user.uuid, query.data.operating_company_id]
      );
      const wo = res.rows[0];
      if (!wo) return { kind: "missing" as const };
      let unitLabel: string | null = null;
      if (wo.unit_id) {
        const ures = await client.query(`SELECT unit_number FROM mdata.units WHERE id = $1 LIMIT 1`, [wo.unit_id]);
        unitLabel = ures.rows[0]?.unit_number != null ? String(ures.rows[0].unit_number) : null;
      }
      await appendCrudAudit(client, user.uuid, "maintenance.work_order.approved", { resource_id: wo.id }, "info", "P6-T11179");
      await enqueueWorkOrderOutbox(client, "work_order.approved", { work_order_id: wo.id, approved_by: user.uuid });

      const recipients = (process.env.WO_APPROVED_NOTIFY_EMAIL ?? "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
      if (recipients.length > 0) {
        void enqueueEmail({
          operatingCompanyId: query.data.operating_company_id,
          toAddresses: recipients,
          subject: `Work order approved — ${String(wo.display_id ?? wo.id)}`,
          templateKey: "wo-approved",
          templateVars: {
            workOrderLabel: String(wo.display_id ?? wo.id),
            shopName: wo.shop_name ? String(wo.shop_name) : "",
            unitLabel: unitLabel ?? "",
            approvedAt: new Date().toISOString(),
          },
          queuedByUserId: user.uuid,
        }).catch(() => undefined);
      }

      return { kind: "ok" as const, wo };
    });

    if (row.kind === "unavailable") return reply.code(501).send({ error: "maintenance_schema_not_available" });
    if (row.kind === "missing") return reply.code(404).send({ error: "work_order_not_found" });
    return { work_order: row.wo };
  });

  app.post("/api/v1/work-orders/:id/start", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!officeWoRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const row = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      if (!(await maintenanceReady(client))) return { kind: "unavailable" as const };
      const res = await client.query(
        `
          UPDATE maintenance.work_orders
          SET status = 'in_progress',
              work_started_at = COALESCE(work_started_at, now()),
              updated_at = now()
          WHERE id = $1 AND operating_company_id = $2 AND status <> 'cancelled' AND status <> 'complete'
          RETURNING *
        `,
        [params.data.id, query.data.operating_company_id]
      );
      const wo = res.rows[0];
      if (!wo) return { kind: "missing" as const };
      await appendCrudAudit(client, user.uuid, "maintenance.work_order.started", { resource_id: wo.id }, "info", "P6-T11179");
      await enqueueWorkOrderOutbox(client, "work_order.started", { work_order_id: wo.id });
      return { kind: "ok" as const, wo };
    });

    if (row.kind === "unavailable") return reply.code(501).send({ error: "maintenance_schema_not_available" });
    if (row.kind === "missing") return reply.code(404).send({ error: "work_order_not_found" });
    return { work_order: row.wo };
  });

  app.post("/api/v1/work-orders/:id/complete", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!officeWoRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const row = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      if (!(await maintenanceReady(client))) return { kind: "unavailable" as const };
      const currentRes = await client.query(`SELECT * FROM maintenance.work_orders WHERE id = $1 AND operating_company_id = $2 LIMIT 1`, [
        params.data.id,
        query.data.operating_company_id,
      ]);
      const prior = currentRes.rows[0];
      if (!prior) return { kind: "missing" as const };

      const res = await client.query(
        `
          UPDATE maintenance.work_orders
          SET status = 'complete',
              work_completed_at = COALESCE(work_completed_at, now()),
              completed_by_user_id = COALESCE(completed_by_user_id, $2),
              updated_at = now()
          WHERE id = $1 AND operating_company_id = $3 AND status <> 'cancelled'
          RETURNING *
        `,
        [params.data.id, user.uuid, query.data.operating_company_id]
      );
      const wo = res.rows[0];
      if (!wo) return { kind: "blocked" as const };

      await appendCrudAudit(client, user.uuid, "maintenance.wo.completed", { resource_id: wo.id }, "info", "P6-T11179");
      await enqueueWorkOrderOutbox(client, "work_order.completed", { work_order_id: wo.id });

      const vendorUuid = String(prior.vendor_id ?? prior.external_vendor_id ?? prior.assigned_vendor ?? "").trim();
      const { vendor_invoice_number } = resolveVendorReferences({
        wo_billing_type: String(prior.wo_billing_type ?? "external") as "internal" | "external",
        wo_service_class: String(prior.wo_service_class ?? "corrective") as z.infer<typeof woServiceClassSchema>,
        vendor_invoice_number: prior.vendor_invoice_number as string | null,
        vendor_work_order_number: prior.vendor_work_order_number as string | null,
        external_vendor_invoice_number: prior.external_vendor_invoice_number as string | null,
        external_vendor_wo_number: prior.external_vendor_wo_number as string | null,
      });

      if (vendor_invoice_number && vendorUuid) {
        const billExists = await client.query(`SELECT id FROM accounting.bills WHERE linked_work_order_uuid = $1 LIMIT 1`, [params.data.id]);
        if ((billExists.rows?.length ?? 0) === 0) {
          const memo = `Auto-created from work order ${String(prior.display_id ?? params.data.id)}`;
          const bill = await autoCreateBillFromWO(client as never, user.uuid, params.data.id, {
            billNumber: vendor_invoice_number,
            memo,
          });
          if (bill?.uuid) {
            await enqueueWorkOrderOutbox(client, "accounting.bill.auto_created_from_wo", {
              bill_id: bill.uuid,
              work_order_id: params.data.id,
            });
          }
        }
      }

      return { kind: "ok" as const, wo };
    });

    if (row.kind === "unavailable") return reply.code(501).send({ error: "maintenance_schema_not_available" });
    if (row.kind === "missing") return reply.code(404).send({ error: "work_order_not_found" });
    if (row.kind === "blocked") return reply.code(409).send({ error: "work_order_not_completable" });
    try {
      await processMaintWorkOrderApPosting({
        operating_company_id: query.data.operating_company_id,
        work_order_id: params.data.id,
        actor_user_id: user.uuid,
      });
    } catch (error) {
      const mapped = mapMaintWoApHttpError(error);
      if (mapped) return reply.code(mapped.statusCode).send(mapped.body);
      throw error;
    }
    return { work_order: row.wo };
  });

  app.post("/api/v1/work-orders/:id/cancel", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!officeWoRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const parsed = cancelBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const row = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      if (!(await maintenanceReady(client))) return { kind: "unavailable" as const };
      const res = await client.query(
        `
          UPDATE maintenance.work_orders
          SET status = 'cancelled',
              cancelled_at = COALESCE(cancelled_at, now()),
              cancelled_by_user_id = COALESCE(cancelled_by_user_id, $2),
              cancellation_reason = COALESCE(cancellation_reason, $3),
              updated_at = now()
          WHERE id = $1 AND operating_company_id = $4 AND status <> 'complete'
          RETURNING *
        `,
        [params.data.id, user.uuid, parsed.data.cancellation_reason ?? null, query.data.operating_company_id]
      );
      const wo = res.rows[0];
      if (!wo) return { kind: "missing" as const };
      await appendCrudAudit(client, user.uuid, "maintenance.work_order.cancelled", { resource_id: wo.id }, "info", "P6-T11179");
      await enqueueWorkOrderOutbox(client, "work_order.cancelled", { work_order_id: wo.id, reason: parsed.data.cancellation_reason ?? null });
      return { kind: "ok" as const, wo };
    });

    if (row.kind === "unavailable") return reply.code(501).send({ error: "maintenance_schema_not_available" });
    if (row.kind === "missing") return reply.code(404).send({ error: "work_order_not_found" });
    return { work_order: row.wo };
  });

  app.post("/api/v1/work-orders/:id/photos", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!officeWoRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const parsed = photoIntentSchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    if (!isR2Configured()) return reply.code(503).send({ error: "r2_not_configured" });

    const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      if (!(await maintenanceReady(client))) return { kind: "unavailable" as const };
      const woRes = await client.query(`SELECT id FROM maintenance.work_orders WHERE id = $1 AND operating_company_id = $2 LIMIT 1`, [
        params.data.id,
        query.data.operating_company_id,
      ]);
      if (woRes.rowCount === 0) return { kind: "missing" as const };
      const objectKey = `work-orders/${query.data.operating_company_id}/${params.data.id}/${randomUUID()}`;
      const signed = await generatePresignedUploadUrl(objectKey, parsed.data.content_type);
      return { kind: "ok" as const, object_key: objectKey, upload_url: signed.url };
    });

    if (payload.kind === "unavailable") return reply.code(501).send({ error: "maintenance_schema_not_available" });
    if (payload.kind === "missing") return reply.code(404).send({ error: "work_order_not_found" });
    return { upload_url: payload.upload_url, object_key: payload.object_key };
  });

  app.patch("/api/v1/work-orders/:id/photos", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!officeWoRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const parsed = appendPhotoSchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const prefix = `work-orders/${query.data.operating_company_id}/${params.data.id}/`;
    if (!parsed.data.object_key.startsWith(prefix)) {
      return reply.code(400).send({ error: "invalid_object_key" });
    }

    const row = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      if (!(await maintenanceReady(client))) return { kind: "unavailable" as const };
      const res = await client.query(
        `
          UPDATE maintenance.work_orders
          SET r2_photo_paths = COALESCE(r2_photo_paths, '{}'::text[]) || ARRAY[$2::text],
              updated_at = now()
          WHERE id = $1 AND operating_company_id = $3
          RETURNING *
        `,
        [params.data.id, parsed.data.object_key, query.data.operating_company_id]
      );
      const wo = res.rows[0];
      if (!wo) return { kind: "missing" as const };
      await enqueueWorkOrderOutbox(client, "work_order.photo_added", { work_order_id: wo.id, object_key: parsed.data.object_key });
      return { kind: "ok" as const, wo };
    });

    if (row.kind === "unavailable") return reply.code(501).send({ error: "maintenance_schema_not_available" });
    if (row.kind === "missing") return reply.code(404).send({ error: "work_order_not_found" });
    return { work_order: row.wo };
  });

  app.get("/api/v1/work-orders/:id/pdf", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      if (!(await maintenanceReady(client))) return { kind: "unavailable" as const };
      const woRes = await client.query(`SELECT * FROM maintenance.work_orders WHERE id = $1 AND operating_company_id = $2 LIMIT 1`, [
        params.data.id,
        query.data.operating_company_id,
      ]);
      const wo = woRes.rows[0];
      if (!wo) return { kind: "missing" as const };

      const companyRes = await client.query(`SELECT * FROM org.companies WHERE id = $1 LIMIT 1`, [query.data.operating_company_id]);
      const company = companyRes.rows[0] ?? {};

      let unit: Record<string, unknown> | null = null;
      if (wo.unit_id) {
        const unitRes = await client.query(`SELECT * FROM mdata.units WHERE id = $1 LIMIT 1`, [wo.unit_id]);
        unit = unitRes.rows[0] ?? null;
      }

      let driver: Record<string, unknown> | null = null;
      if (wo.driver_id) {
        const driverRes = await client.query(`SELECT * FROM mdata.drivers WHERE id = $1 LIMIT 1`, [wo.driver_id]);
        driver = driverRes.rows[0] ?? null;
      }

      const model = buildPdfModel({ company, wo, unit, driver });
      return { kind: "html" as const, html: renderWorkOrderPdfHtml(model) };
    });

    if ("kind" in payload && payload.kind === "unavailable") return reply.code(501).send({ error: "maintenance_schema_not_available" });
    if ("kind" in payload && payload.kind === "missing") return reply.code(404).send({ error: "work_order_not_found" });

    reply.header("Content-Type", "text/html; charset=utf-8");
    return reply.send(payload.html);
  });
}
