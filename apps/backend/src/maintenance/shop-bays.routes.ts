/**
 * LEAD 443.301 · register row 59 — Maintenance › In Shop bay board (V3 board Maintenance-InShop).
 *
 * GET  /api/v1/maintenance/shop-bays?operating_company_id=        -> { bay_count, bays[], yard[] }
 * POST /api/v1/maintenance/work-orders/:id/bay?operating_company_id=          body { bay_number }
 * POST /api/v1/maintenance/work-orders/:id/bay/release?operating_company_id=
 *
 * A bay is OCCUPIED from assignment until release (migration 202616261700: uq_work_orders_bay_occupied). A finished
 * work order still holding its bay reads "Ready" until released. The yard lane = active work orders (open /
 * in_progress / waiting_parts) holding no bay. Bay count = maintenance_settings.shop_bay_count (never a literal).
 * Company-scoped, audited (appendCrudAudit), no money, no GL.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

type Q = { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number | null }> };

export const ACTIVE_WO_STATUSES = ["open", "in_progress", "waiting_parts", "awaiting_parts"] as const;

export type BayWorkOrder = {
  work_order_id: string;
  display_id: string | null;
  status: string;
  unit_id: string | null;
  unit_number: string | null;
  title: string | null;
  bay_number: number | null;
  bay_assigned_at: string | null;
  in_shop_at: string | null;
  expected_release_at: string | null;
};
export type ShopBay = { bay_number: number; work_order: BayWorkOrder | null };
export type ShopBaysPayload = { operating_company_id: string; bay_count: number; bays: ShopBay[]; yard: BayWorkOrder[] };

const companyQuery = z.object({ operating_company_id: z.string().uuid() });
const idParams = z.object({ id: z.string().uuid() });
const assignBody = z.object({ bay_number: z.number().int().min(1).max(50) });

const WO_COLUMNS = `
  wo.id::text AS work_order_id, wo.display_id, wo.status, wo.unit_id::text AS unit_id, u.unit_number,
  COALESCE(NULLIF(btrim(wo.wo_title), ''), NULLIF(btrim(wo.description), ''), NULLIF(btrim(wo.repair_complaint), '')) AS title,
  wo.bay_number::int AS bay_number, wo.bay_assigned_at::text AS bay_assigned_at, wo.in_shop_at::text AS in_shop_at,
  wo.expected_release_at::text AS expected_release_at`;

/** Pure: lay occupied work orders onto bays 1..bayCount. Exported for the unit test. */
export function layoutBays(bayCount: number, occupied: BayWorkOrder[]): ShopBay[] {
  const byBay = new Map(occupied.filter((w) => w.bay_number != null).map((w) => [Number(w.bay_number), w]));
  return Array.from({ length: bayCount }, (_, i) => ({ bay_number: i + 1, work_order: byBay.get(i + 1) ?? null }));
}

export async function loadShopBays(client: Q, companyId: string): Promise<ShopBaysPayload> {
  const s = await client.query<{ shop_bay_count: number }>(
    `SELECT shop_bay_count::int AS shop_bay_count FROM maintenance.maintenance_settings WHERE operating_company_id = $1::uuid LIMIT 1`,
    [companyId],
  );
  const bayCount = Number(s.rows[0]?.shop_bay_count ?? 4);
  const occupied = await client.query<BayWorkOrder>(
    `SELECT ${WO_COLUMNS}
       FROM maintenance.work_orders wo
       LEFT JOIN mdata.units u ON u.id = wo.unit_id
      WHERE wo.operating_company_id = $1::uuid AND wo.voided_at IS NULL
        AND wo.bay_number IS NOT NULL AND wo.bay_released_at IS NULL
      ORDER BY wo.bay_number`,
    [companyId],
  );
  const yard = await client.query<BayWorkOrder>(
    `SELECT ${WO_COLUMNS}
       FROM maintenance.work_orders wo
       LEFT JOIN mdata.units u ON u.id = wo.unit_id
      WHERE wo.operating_company_id = $1::uuid AND wo.voided_at IS NULL
        AND wo.status = ANY($2::text[])
        AND (wo.bay_number IS NULL OR wo.bay_released_at IS NOT NULL)
      ORDER BY COALESCE(wo.in_shop_at, wo.opened_at, wo.created_at) ASC, wo.id`,
    [companyId, [...ACTIVE_WO_STATUSES]],
  );
  return { operating_company_id: companyId, bay_count: bayCount, bays: layoutBays(bayCount, occupied.rows), yard: yard.rows };
}

function user(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}
// Same roles that may create / edit a work order (work-orders.routes.ts create + PATCH gates).
const canMove = (role: string) => ["Owner", "Administrator", "Manager", "Dispatcher", "Safety"].includes(role);

async function scoped<T>(userId: string, companyId: string, fn: (c: Q) => Promise<T>) {
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    return fn(client as unknown as Q);
  });
}

export async function registerMaintenanceShopBaysRoutes(app: FastifyInstance) {
  app.get("/api/v1/maintenance/shop-bays", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    const u = user(req, reply); if (!u) return;
    const q = companyQuery.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error", details: q.error.flatten() });
    return scoped(u.uuid, q.data.operating_company_id, (c) => loadShopBays(c, q.data.operating_company_id));
  });

  app.post("/api/v1/maintenance/work-orders/:id/bay", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const u = user(req, reply); if (!u) return;
    if (!canMove(u.role)) return reply.code(403).send({ error: "forbidden" });
    const q = companyQuery.safeParse(req.query ?? {}); const p = idParams.safeParse(req.params ?? {}); const b = assignBody.safeParse(req.body ?? {});
    if (!q.success || !p.success || !b.success) return reply.code(400).send({ error: "validation_error" });
    const companyId = q.data.operating_company_id;
    const result = await scoped(u.uuid, companyId, async (c) => {
      const cfg = await loadShopBays(c, companyId);
      if (b.data.bay_number > cfg.bay_count) return { code: 400, body: { error: "bay_out_of_range", bay_count: cfg.bay_count } };
      const taken = cfg.bays[b.data.bay_number - 1]?.work_order;
      if (taken && taken.work_order_id !== p.data.id) return { code: 409, body: { error: "bay_occupied", bay_number: b.data.bay_number, work_order_id: taken.work_order_id } };
      const upd = await c.query<{ id: string }>(
        `UPDATE maintenance.work_orders
            SET bay_number = $3, bay_assigned_at = now(), bay_assigned_by_user_id = $4::uuid,
                bay_released_at = NULL, bay_released_by_user_id = NULL,
                in_shop_at = COALESCE(in_shop_at, now()), updated_at = now()
          WHERE id = $1::uuid AND operating_company_id = $2::uuid AND voided_at IS NULL
            AND status = ANY($5::text[])
          RETURNING id::text`,
        [p.data.id, companyId, b.data.bay_number, u.uuid, [...ACTIVE_WO_STATUSES]],
      );
      if (!upd.rows[0]) return { code: 404, body: { error: "work_order_not_active" } };
      await appendCrudAudit(c as never, u.uuid, "maintenance.work_order.bay_assigned",
        { resource_type: "maintenance.work_orders", resource_id: p.data.id, operating_company_id: companyId, changes: { bay_number: b.data.bay_number } },
        "info", "443.301-r59-shop-bays");
      return { code: 200, body: await loadShopBays(c, companyId) };
    });
    return reply.code(result.code).send(result.body);
  });

  app.post("/api/v1/maintenance/work-orders/:id/bay/release", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const u = user(req, reply); if (!u) return;
    if (!canMove(u.role)) return reply.code(403).send({ error: "forbidden" });
    const q = companyQuery.safeParse(req.query ?? {}); const p = idParams.safeParse(req.params ?? {});
    if (!q.success || !p.success) return reply.code(400).send({ error: "validation_error" });
    const companyId = q.data.operating_company_id;
    const result = await scoped(u.uuid, companyId, async (c) => {
      const upd = await c.query<{ bay_number: number }>(
        `UPDATE maintenance.work_orders
            SET bay_released_at = now(), bay_released_by_user_id = $3::uuid, updated_at = now()
          WHERE id = $1::uuid AND operating_company_id = $2::uuid AND bay_number IS NOT NULL AND bay_released_at IS NULL
          RETURNING bay_number::int`,
        [p.data.id, companyId, u.uuid],
      );
      if (!upd.rows[0]) return { code: 404, body: { error: "work_order_holds_no_bay" } };
      await appendCrudAudit(c as never, u.uuid, "maintenance.work_order.bay_released",
        { resource_type: "maintenance.work_orders", resource_id: p.data.id, operating_company_id: companyId, changes: { bay_number: upd.rows[0].bay_number } },
        "info", "443.301-r59-shop-bays");
      return { code: 200, body: await loadShopBays(c, companyId) };
    });
    return reply.code(result.code).send(result.body);
  });
}
