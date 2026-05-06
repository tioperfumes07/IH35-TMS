import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";

const workOrderStatusSchema = z.enum(["open", "in_progress", "waiting_parts", "complete", "cancelled"]);
const workOrderTypeSchema = z.enum(["pm", "repair", "tire", "accident"]);
const paymentTimingSchema = z.enum(["in_house", "paid_same_day", "vendor_invoice"]);

const listQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.string().optional(),
  wo_type: z.string().optional(),
  search: z.string().trim().max(120).optional(),
});

const idParamsSchema = z.object({ id: z.string().uuid() });
const lineItemParamsSchema = z.object({ id: z.string().uuid(), lid: z.string().uuid() });

const createWorkOrderSchema = z.object({
  operating_company_id: z.string().uuid(),
  wo_type: workOrderTypeSchema,
  status: workOrderStatusSchema.default("open"),
  unit_id: z.string().uuid(),
  driver_id: z.string().uuid().optional(),
  load_id: z.string().uuid().optional(),
  service_date: z.string().optional(),
  repair_location: z.string().default("in_house"),
  vendor_id: z.string().uuid().optional(),
  vendor_invoice_number: z.string().trim().max(120).optional(),
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

async function withCompany<T>(userId: string, companyId: string, fn: (client: any) => Promise<T>) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${companyId}'`);
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
      if (q.status) {
        values.push(q.status);
        where.push(`w.status = $${values.length}`);
      }
      if (q.wo_type) {
        values.push(q.wo_type);
        where.push(`w.wo_type = $${values.length}`);
      }
      if (q.search) {
        values.push(`%${q.search}%`);
        where.push(`(COALESCE(w.display_id, '') ILIKE $${values.length} OR COALESCE(w.description, '') ILIKE $${values.length})`);
      }
      const countRes = await client.query(
        `SELECT count(*)::int AS cnt FROM maintenance.work_orders w WHERE ${where.join(" AND ")}`,
        values
      );
      values.push(q.limit, q.offset);
      const rowsRes = await client.query(
        `SELECT * FROM maintenance.work_orders w WHERE ${where.join(" AND ")} ORDER BY w.opened_at DESC NULLS LAST, w.created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
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
      const lines = await client.query(`SELECT * FROM maintenance.wo_line_items WHERE work_order_id = $1 ORDER BY created_at ASC`, [params.data.id]);
      const history = await client.query(`SELECT * FROM maintenance.wo_status_history WHERE work_order_id = $1 ORDER BY created_at ASC`, [params.data.id]);
      return { ...wo.rows[0], line_items: lines.rows, status_history: history.rows };
    });

    if (!detail) return reply.code(404).send({ error: "work_order_not_found" });
    return detail;
  });

  app.post("/api/v1/maintenance/work-orders", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
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
    if (body.repair_location !== "in_house" && !body.vendor_id) {
      return reply.code(400).send({ error: "vendor_required_for_external_repairs" });
    }

    const created = await withCompany(user.uuid, body.operating_company_id, async (client) => {
      if (!(await maintenanceReady(client))) {
        return { unavailable: true as const };
      }

      const woRes = await client.query(
        `
          INSERT INTO maintenance.work_orders (
            operating_company_id, wo_type, status, unit_id, driver_id, load_id, opened_at,
            repair_location, assigned_vendor, vendor_invoice_number, description, severity
          )
          VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7::timestamptz, now()),$8,$9,$10,$11,$12)
          RETURNING *
        `,
        [
          body.operating_company_id,
          body.wo_type,
          body.status,
          body.unit_id,
          body.driver_id ?? null,
          body.load_id ?? null,
          body.service_date ?? null,
          body.repair_location,
          body.vendor_id ?? null,
          body.vendor_invoice_number ?? null,
          body.description,
          body.severity ?? null,
        ]
      );
      const wo = woRes.rows[0];

      for (const line of body.line_items) {
        await client.query(
          `
            INSERT INTO maintenance.wo_line_items (work_order_id, line_type, description, quantity, unit_cost, amount)
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
        "maintenance.work_order.created",
        {
          resource_type: "maintenance.work_orders",
          resource_id: wo.id,
          operating_company_id: wo.operating_company_id,
          wo_type: wo.wo_type,
          payment_timing: body.payment_timing,
        },
        "info",
        "BT-3-MAINTENANCE-REBUILD"
      );

      return { unavailable: false as const, row: wo };
    });

    if (created.unavailable) {
      return reply.code(501).send({ error: "maintenance_schema_not_available" });
    }
    return reply.code(201).send(created.row);
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
      return { ok: true as const };
    });

    if ("unavailable" in result) return reply.code(501).send({ error: "maintenance_schema_not_available" });
    if ("notFound" in result) return reply.code(404).send({ error: "work_order_not_found" });
    if ("invalid" in result) return reply.code(400).send({ error: "invalid_transition", from_status: result.from, to_status: result.to });
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

    const row = await withCompany(user.uuid, companyId, async (client) => {
      if (!(await maintenanceReady(client))) return null;
      const wo = await client.query(`SELECT id FROM maintenance.work_orders WHERE id = $1 AND operating_company_id = $2 LIMIT 1`, [
        params.data.id,
        companyId,
      ]);
      if (wo.rowCount === 0) return undefined;
      const res = await client.query(
        `
          INSERT INTO maintenance.wo_line_items (work_order_id, line_type, description, quantity, unit_cost, amount)
          VALUES ($1,$2,$3,$4,$5,$6)
          RETURNING *
        `,
        [params.data.id, parsed.data.line_type, parsed.data.description, parsed.data.quantity, parsed.data.unit_cost, parsed.data.amount]
      );
      return res.rows[0];
    });
    if (row === null) return reply.code(501).send({ error: "maintenance_schema_not_available" });
    if (row === undefined) return reply.code(404).send({ error: "work_order_not_found" });
    return reply.code(201).send(row);
  });

  app.delete("/api/v1/maintenance/work-orders/:id/line-items/:lid", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = lineItemParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const companyId = String((req.query as Record<string, unknown> | undefined)?.["operating_company_id"] ?? "");
    if (!companyId) return reply.code(400).send({ error: "operating_company_id_required" });

    const deleted = await withCompany(user.uuid, companyId, async (client) => {
      if (!(await maintenanceReady(client))) return null;
      const res = await client.query(
        `
          DELETE FROM maintenance.wo_line_items li
          USING maintenance.work_orders w
          WHERE li.id = $1
            AND li.work_order_id = w.id
            AND w.id = $2
            AND w.operating_company_id = $3
          RETURNING li.id
        `,
        [params.data.lid, params.data.id, companyId]
      );
      return res.rowCount > 0;
    });
    if (deleted === null) return reply.code(501).send({ error: "maintenance_schema_not_available" });
    if (!deleted) return reply.code(404).send({ error: "line_item_not_found" });
    return reply.code(204).send();
  });
}
