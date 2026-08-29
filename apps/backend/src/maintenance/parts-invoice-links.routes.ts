import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
  vendor_id: z.string().uuid().optional(),
  work_order_id: z.string().uuid().optional(),
  unit_id: z.string().uuid().optional(),
  unit_linked_only: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(300).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
// ACCT-F5756 — no frontend caller of DELETE exists yet (verified via repo-wide grep before this fix),
// so this can add a reason without breaking an in-flight UI; defaults to a fixed reason for API
// callers that omit it rather than making it a required breaking change up front.
const voidQuerySchema = querySchema.extend({
  void_reason: z.string().trim().min(1).max(500).optional(),
});
const woParamsSchema = z.object({ id: z.string().uuid() });
const unitParamsSchema = z.object({ unitId: z.string().uuid() });
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
  if (!requireAuth(req, reply)) return reply;
  return req.user;
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: any) => Promise<T>) {
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    return fn(client);
  });
}

export async function registerMaintenancePartsInvoiceLinksRoutes(app: FastifyInstance) {
  /**
   * Company-wide assignment trail: parts consumed / linked onto work orders.
   * SoR = maintenance.parts_invoice_links (blueprint: WO part usage + optional stock decrement).
   * ADD-ONLY — does not replace Purchases stock list or delete create/delete link routes.
   */
  app.get(
    "/api/v1/maintenance/parts-invoice-links",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });

    const rows = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      const values: unknown[] = [query.data.operating_company_id];
      const filters = ["pil.operating_company_id = $1::uuid"];
      if (query.data.vendor_id) {
        values.push(query.data.vendor_id);
        filters.push(`pil.vendor_id = $${values.length}::uuid`);
      }
      if (query.data.work_order_id) {
        values.push(query.data.work_order_id);
        filters.push(`pil.work_order_id = $${values.length}::uuid`);
      }
      if (query.data.unit_id) {
        values.push(query.data.unit_id);
        filters.push(`wo.unit_id = $${values.length}::uuid`);
      }
      if (query.data.unit_linked_only) filters.push("wo.unit_id IS NOT NULL");
      const countRes = await client.query(
        `SELECT COUNT(*)::text AS total_count
           FROM maintenance.parts_invoice_links pil
           INNER JOIN maintenance.work_orders wo ON wo.id = pil.work_order_id AND wo.operating_company_id = pil.operating_company_id
          WHERE ${filters.join(" AND ")} AND pil.voided_at IS NULL`,
        values,
      );
      const res = await client.query(
        `
          SELECT
            pil.id::text AS id,
            pil.operating_company_id::text AS operating_company_id,
            pil.work_order_id::text AS work_order_id,
            wo.display_id AS work_order_display_id,
            wo.unit_id::text AS unit_id,
            u.unit_number AS unit_number,
            pil.parts_inventory_id::text AS parts_inventory_id,
            pil.part_description,
            pi.part_number,
            pil.qty_used,
            pil.vendor_id::text AS vendor_id,
            v.vendor_name AS vendor_name,
            pil.vendor_invoice_number,
            pil.vendor_invoice_amount::float8 AS vendor_invoice_amount,
            pil.created_at,
            pil.created_by_user_id::text AS created_by_user_id
          FROM maintenance.parts_invoice_links pil
          INNER JOIN maintenance.work_orders wo
            ON wo.id = pil.work_order_id
           AND wo.operating_company_id = pil.operating_company_id
          LEFT JOIN mdata.units u ON u.id = wo.unit_id
                                 AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = pil.operating_company_id
          LEFT JOIN mdata.vendors v ON v.id = pil.vendor_id
                                   AND v.operating_company_id = pil.operating_company_id
          LEFT JOIN maintenance.parts_inventory pi ON pi.id = pil.parts_inventory_id
                                                           AND pi.operating_company_id = pil.operating_company_id
          WHERE ${filters.join(" AND ")}
            AND pil.voided_at IS NULL
          ORDER BY pil.created_at DESC
          LIMIT $${values.length + 1}
          OFFSET $${values.length + 2}
        `,
        [...values, query.data.limit, query.data.offset]
      );
      return { rows: res.rows, totalCount: Number(countRes.rows[0]?.total_count ?? 0) };
    });

    return { rows: rows.rows, total_count: rows.totalCount, limit: query.data.limit, offset: query.data.offset };
  });

  /**
   * Unit reverse drill-through: parts consumed on work orders for a single unit.
   * Join path: parts_invoice_links → work_orders WHERE wo.unit_id = :unitId (no new FK/migration).
   */
  app.get(
    "/api/v1/maintenance/units/:unitId/parts-history",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = authed(req, reply);
      if (!user) return;
      const params = unitParamsSchema.safeParse(req.params ?? {});
      if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
      const query = querySchema.safeParse(req.query ?? {});
      if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });

      const rows = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
        const unitRes = await client.query(
          `SELECT id::text AS id FROM mdata.units
           WHERE id = $1 AND (owner_company_id = $2 OR currently_leased_to_company_id = $2)
           LIMIT 1`,
          [params.data.unitId, query.data.operating_company_id]
        );
        if (!unitRes.rows[0]) return { notFound: true as const };

        const countRes = await client.query(
          `SELECT COUNT(*)::text AS total_count
             FROM maintenance.parts_invoice_links pil
             INNER JOIN maintenance.work_orders wo ON wo.id = pil.work_order_id AND wo.operating_company_id = pil.operating_company_id
            WHERE pil.operating_company_id = $1::uuid AND wo.unit_id = $2::uuid AND pil.voided_at IS NULL`,
          [query.data.operating_company_id, params.data.unitId],
        );
        const res = await client.query(
          `
            SELECT
              pil.id::text AS id,
              pil.operating_company_id::text AS operating_company_id,
              pil.work_order_id::text AS work_order_id,
              wo.display_id AS work_order_display_id,
              wo.unit_id::text AS unit_id,
              u.unit_number AS unit_number,
              pil.parts_inventory_id::text AS parts_inventory_id,
              pil.part_description,
              pi.part_number,
              pil.qty_used,
              pil.vendor_id::text AS vendor_id,
              v.vendor_name AS vendor_name,
              pil.vendor_invoice_number,
              pil.vendor_invoice_amount::float8 AS vendor_invoice_amount,
              pil.created_at,
              pil.created_by_user_id::text AS created_by_user_id
            FROM maintenance.parts_invoice_links pil
            INNER JOIN maintenance.work_orders wo
              ON wo.id = pil.work_order_id
             AND wo.operating_company_id = pil.operating_company_id
            LEFT JOIN mdata.units u ON u.id = wo.unit_id
                                   AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = pil.operating_company_id
            LEFT JOIN mdata.vendors v ON v.id = pil.vendor_id
                                     AND v.operating_company_id = pil.operating_company_id
            LEFT JOIN maintenance.parts_inventory pi ON pi.id = pil.parts_inventory_id
                                                             AND pi.operating_company_id = pil.operating_company_id
            WHERE pil.operating_company_id = $1::uuid
              AND wo.unit_id = $2
              AND pil.voided_at IS NULL
            ORDER BY pil.created_at DESC
            LIMIT $3 OFFSET $4
          `,
          [query.data.operating_company_id, params.data.unitId, query.data.limit, query.data.offset]
        );
        return { rows: res.rows, total_count: Number(countRes.rows[0]?.total_count ?? 0) };
      });

      if ("notFound" in rows) return reply.code(404).send({ error: "unit_not_found" });
      return { rows: rows.rows, total_count: rows.total_count, limit: query.data.limit, offset: query.data.offset };
    }
  );

  app.post("/api/v1/maintenance/work-orders/:id/parts-invoice-links", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
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
        `SELECT id, operating_company_id, status FROM maintenance.work_orders WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`,
        [params.data.id, query.data.operating_company_id]
      );
      const wo = woRes.rows[0] as { id: string; status: string } | undefined;
      if (!wo) return { notFound: true as const };
      if (["complete", "completed"].includes(String(wo.status))) {
        return { locked: true as const };
      }

      const linkedEntities = await client.query(
        `SELECT
           EXISTS (
             SELECT 1 FROM mdata.vendors v
             WHERE v.id = $1::uuid
               AND v.operating_company_id = $2::uuid
               AND v.deactivated_at IS NULL
           ) AS vendor_ok,
           ($3::uuid IS NULL OR EXISTS (
             SELECT 1 FROM maintenance.parts_inventory pi
             WHERE pi.id = $3::uuid
               AND pi.operating_company_id = $2::uuid
           )) AS part_ok`,
        [body.data.vendor_id, query.data.operating_company_id, body.data.parts_inventory_id ?? null],
      );
      const linkState = linkedEntities.rows[0] as { vendor_ok?: boolean; part_ok?: boolean } | undefined;
      if (!linkState?.vendor_ok || !linkState?.part_ok) {
        return { invalidLink: true as const };
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
            WHERE id = $1 AND operating_company_id = $3::uuid
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
        { operating_company_id: query.data.operating_company_id, resource_id: params.data.id, parts_invoice_link_id: link.id, display_id: displayId },
        "info",
        "BT-3-WO-FORMAT-VENDOR-INVENTORY-INTEGRITY"
      );
      await appendCrudAudit(
        client,
        user.uuid,
        "maintenance.wo.display_id_refreshed",
        { operating_company_id: query.data.operating_company_id, resource_id: params.data.id, trigger: "parts_link_added", display_id: displayId },
        "info",
        "BT-3-WO-FORMAT-VENDOR-INVENTORY-INTEGRITY"
      );
      return { link, display_id: displayId };
    });

    if ("invalidLink" in result) {
      return reply.code(400).send({ error: "linked_entity_not_in_operating_company" });
    }

    if ("notFound" in result) return reply.code(404).send({ error: "work_order_not_found" });
    if ("locked" in result) {
      return reply.code(422).send({
        error: "E_WO_DISPLAY_ID_LOCKED",
        message: "Work-order display ID is locked after completion and cannot be changed.",
      });
    }
    return reply.code(201).send(result);
  });

  app.delete("/api/v1/maintenance/parts-invoice-links/:id", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = linkParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const query = voidQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });

    // ACCT-F5756 — INVENTORY-PARTS-ASSIGNMENT-PHYSICAL-DELETE: this route used to physically remove
    // the row outright, destroying the append-only WO parts-consumption record with no reversal
    // metadata, and never restoring parts_inventory.on_hand_qty (the stock this link's create path
    // decremented by qty_used). Same-company void that stamps actor/reason, excludes voided rows from
    // every active read (list/unit-history/wo-cost-validation), and restores stock exactly once,
    // atomically with the void itself.
    const result = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      const voided = await client.query(
        `
          UPDATE maintenance.parts_invoice_links
          SET voided_at = now(), void_reason = $3, voided_by_user_id = $4::uuid
          WHERE id = $1 AND operating_company_id = $2::uuid AND voided_at IS NULL
          RETURNING id, work_order_id, parts_inventory_id, qty_used
        `,
        [
          params.data.id,
          query.data.operating_company_id,
          query.data.void_reason ?? "Removed via parts-invoice-links API",
          user.uuid,
        ]
      );
      const row = voided.rows[0] as
        | { id: string; work_order_id: string; parts_inventory_id: string | null; qty_used: number }
        | undefined;
      if (!row) return { notFound: true as const };

      if (row.parts_inventory_id) {
        await client.query(
          `
            UPDATE maintenance.parts_inventory
            SET on_hand_qty = COALESCE(on_hand_qty, 0) + $2, updated_at = now()
            WHERE id = $1 AND operating_company_id = $3::uuid
          `,
          [row.parts_inventory_id, row.qty_used, query.data.operating_company_id]
        );
      }

      await appendCrudAudit(
        client,
        user.uuid,
        "maintenance.wo.parts_link_removed",
        {
          operating_company_id: query.data.operating_company_id,
          resource_id: row.work_order_id,
          parts_invoice_link_id: row.id,
          void_reason: query.data.void_reason ?? "Removed via parts-invoice-links API",
          stock_restored_qty: row.parts_inventory_id ? row.qty_used : 0,
        },
        "warning",
        "BT-3-WO-FORMAT-VENDOR-INVENTORY-INTEGRITY"
      );
      return { ok: true };
    });

    if ("notFound" in result) return reply.code(404).send({ error: "parts_invoice_link_not_found" });
    return reply.code(204).send();
  });
}
