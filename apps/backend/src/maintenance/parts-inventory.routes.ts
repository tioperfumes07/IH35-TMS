import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const querySchema = z.object({ operating_company_id: z.string().uuid() });
const idParamsSchema = z.object({ id: z.string().uuid() });
const purchaseSchema = z.object({
  part_description: z.string().trim().min(1).max(250),
  vendor_id: z.string().uuid().optional(),
  vendor_invoice_number: z.string().trim().max(120).optional(),
  purchase_amount: z.number().nonnegative().optional(),
  qty_received: z.number().int().positive(),
  location: z.string().trim().max(120).optional(),
});
const adjustSchema = z.object({
  delta_qty: z.number().int(),
  reason: z.enum(["used", "discarded", "shrinkage", "recount"]),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: any) => Promise<T>) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${companyId}'`);
    return fn(client);
  });
}

export async function registerMaintenancePartsInventoryRoutes(app: FastifyInstance) {
  app.get("/api/v1/maintenance/parts-inventory", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const rows = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `SELECT * FROM maintenance.parts_inventory WHERE operating_company_id = $1 ORDER BY updated_at DESC, created_at DESC`,
        [query.data.operating_company_id]
      );
      return res.rows;
    });
    return { rows };
  });

  app.post("/api/v1/maintenance/parts-inventory/purchases", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const body = purchaseSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const row = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          INSERT INTO maintenance.parts_inventory (
            part_description, vendor_id, last_purchase_invoice_number, last_purchase_amount,
            last_purchase_date, on_hand_qty, location, operating_company_id
          )
          VALUES ($1,$2,$3,$4,now()::date,$5,$6,$7)
          RETURNING *
        `,
        [
          body.data.part_description,
          body.data.vendor_id ?? null,
          body.data.vendor_invoice_number ?? null,
          body.data.purchase_amount ?? null,
          body.data.qty_received,
          body.data.location ?? null,
          query.data.operating_company_id,
        ]
      );
      return res.rows[0];
    });

    return reply.code(201).send(row);
  });

  app.patch("/api/v1/maintenance/parts-inventory/:id/adjust", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const body = adjustSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const result = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE maintenance.parts_inventory
          SET on_hand_qty = GREATEST(0, COALESCE(on_hand_qty, 0) + $3), updated_at = now()
          WHERE id = $1 AND operating_company_id = $2
          RETURNING *
        `,
        [params.data.id, query.data.operating_company_id, body.data.delta_qty]
      );
      const row = res.rows[0];
      if (!row) return { notFound: true as const };
      await appendCrudAudit(
        client,
        user.uuid,
        "maintenance.parts_inventory.adjusted",
        {
          resource_id: params.data.id,
          reason: body.data.reason,
          delta_qty: body.data.delta_qty,
          on_hand_qty: row.on_hand_qty,
        },
        body.data.reason === "shrinkage" ? "warning" : "info",
        "BT-3-WO-FORMAT-VENDOR-INVENTORY-INTEGRITY"
      );
      return { row };
    });

    if ("notFound" in result) return reply.code(404).send({ error: "parts_inventory_not_found" });
    return result.row;
  });
}
