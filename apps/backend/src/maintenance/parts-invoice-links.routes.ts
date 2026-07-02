import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const querySchema = z.object({ operating_company_id: z.string().uuid() });
const woParamsSchema = z.object({ id: z.string().uuid() });
const linkParamsSchema = z.object({ id: z.string().uuid() });
const createLinkSchema = z.object({
  vendor_id: z.string().uuid(),
  vendor_invoice_number: z.string().trim().min(1).max(120),
  vendor_invoice_amount: z.number().positive(),
  qty_used: z.number().int().positive().default(1),
  part_description: z.string().trim().min(1).max(250),
  parts_inventory_id: z.string().uuid().optional(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: any) => Promise<T>) {
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
    return fn(client);
  });
}

export async function registerMaintenancePartsInvoiceLinksRoutes(app: FastifyInstance) {
  app.post("/api/v1/maintenance/work-orders/:id/parts-invoice-links", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = woParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const body = createLinkSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const result = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      const woRes = await client.query(
        `SELECT id, operating_company_id, status FROM maintenance.work_orders WHERE id = $1 AND operating_company_id = $2 LIMIT 1`,
        [params.data.id, query.data.operating_company_id]
      );
      const wo = woRes.rows[0] as { id: string; status: string } | undefined;
      if (!wo) return { notFound: true as const };
      if (["complete", "completed"].includes(String(wo.status))) {
        return { locked: true as const };
      }

      const inserted = await client.query(
        `
          INSERT INTO maintenance.parts_invoice_links (
            work_order_id, vendor_id, vendor_invoice_number, vendor_invoice_amount,
            qty_used, part_description, parts_inventory_id, operating_company_id, created_by_user_id
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          RETURNING *
        `,
        [
          params.data.id,
          body.data.vendor_id,
          body.data.vendor_invoice_number,
          body.data.vendor_invoice_amount,
          body.data.qty_used,
          body.data.part_description,
          body.data.parts_inventory_id ?? null,
          query.data.operating_company_id,
          user.uuid,
        ]
      );
      const link = inserted.rows[0];

      if (body.data.parts_inventory_id) {
        await client.query(
          `
            UPDATE maintenance.parts_inventory
            SET on_hand_qty = GREATEST(0, COALESCE(on_hand_qty, 0) - $2), updated_at = now()
            WHERE id = $1 AND operating_company_id = $3
          `,
          [body.data.parts_inventory_id, body.data.qty_used, query.data.operating_company_id]
        );
      }

      const refreshed = await client.query(`SELECT maintenance.refresh_wo_display_id($1) AS display_id`, [params.data.id]);
      const displayId = (refreshed.rows[0] as { display_id?: string } | undefined)?.display_id ?? null;

      await appendCrudAudit(
        client,
        user.uuid,
        "maintenance.wo.parts_link_added",
        { resource_id: params.data.id, parts_invoice_link_id: link.id, display_id: displayId },
        "info",
        "BT-3-WO-FORMAT-VENDOR-INVENTORY-INTEGRITY"
      );
      await appendCrudAudit(
        client,
        user.uuid,
        "maintenance.wo.display_id_refreshed",
        { resource_id: params.data.id, trigger: "parts_link_added", display_id: displayId },
        "info",
        "BT-3-WO-FORMAT-VENDOR-INVENTORY-INTEGRITY"
      );
      return { link, display_id: displayId };
    });

    if ("notFound" in result) return reply.code(404).send({ error: "work_order_not_found" });
    if ("locked" in result) return reply.code(422).send({ error: "E_WO_DISPLAY_ID_LOCKED" });
    return reply.code(201).send(result);
  });

  app.delete("/api/v1/maintenance/parts-invoice-links/:id", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = linkParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });

    const result = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      const deleted = await client.query(
        `
          DELETE FROM maintenance.parts_invoice_links
          WHERE id = $1 AND operating_company_id = $2
          RETURNING id, work_order_id
        `,
        [params.data.id, query.data.operating_company_id]
      );
      const row = deleted.rows[0] as { id: string; work_order_id: string } | undefined;
      if (!row) return { notFound: true as const };
      await appendCrudAudit(
        client,
        user.uuid,
        "maintenance.wo.parts_link_removed",
        { resource_id: row.work_order_id, parts_invoice_link_id: row.id },
        "warning",
        "BT-3-WO-FORMAT-VENDOR-INVENTORY-INTEGRITY"
      );
      return { ok: true };
    });

    if ("notFound" in result) return reply.code(404).send({ error: "parts_invoice_link_not_found" });
    return reply.code(204).send();
  });
}
