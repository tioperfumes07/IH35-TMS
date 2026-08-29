import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  search: z.string().trim().optional(),
});

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return reply;
  return req.user;
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: Queryable) => Promise<T>
) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [operatingCompanyId]);
    return fn(client as Queryable);
  });
}

// SWEEP-C2 (2026-09-02): the write endpoints below (POST/PATCH) used to INSERT/UPDATE the RETIRE-class
// `maint.part` table directly — a confirmed live writer per verify-no-retire-table-writes.mjs
// KNOWN_LEGACY + scripts/verify-sweep-c2-no-retire-writes.baseline.json. `maint.part` was already
// superseded for CREATE/UPDATE by maintenance.parts_inventory back in 0292_mnt5_migrate_parts_from_maint.sql
// / 0357_maint_parts_unify_deprecation.sql (canonical create/update routes:
// apps/backend/src/maintenance/parts.routes.ts + parts-inventory.routes.ts, both mounted and used by the
// frontend today). No frontend caller ever hit POST/PATCH on this legacy `/api/v1/maint/parts*` path
// (apps/frontend/src/api/maintenance.ts only calls the GET `listMaintParts`); these were dead write
// endpoints kept alive only by dead code. Root-cause fix: retire the writes (410 Gone, canonical location
// named) rather than repoint them to a second, redundant writer — the GET read endpoint is unaffected and
// keeps serving `maint.part` (a KNOWN_LEGACY read, not a write, per the C2 guard).
const GONE_BODY = {
  error: "gone",
  message:
    "This write endpoint has been retired. maint.part is read-only going forward; create/update parts via /api/v1/maintenance/parts (or /api/v1/maintenance/parts-inventory).",
  canonical: "/api/v1/maintenance/parts",
} as const;

export async function registerMaintPartsRoutes(app: FastifyInstance) {
  app.get("/api/v1/maint/parts", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });

    const rows = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const values: unknown[] = [parsed.data.operating_company_id];
      const filters = ["tenant_id = $1::uuid"];
      if (parsed.data.search) {
        values.push(`%${parsed.data.search}%`);
        const idx = values.length;
        filters.push(`(sku ILIKE $${idx} OR name ILIKE $${idx})`);
      }
      const result = await client.query(
        `
          SELECT
            id::text,
            sku,
            name,
            category,
            unit_cost_cents::int,
            qty_on_hand::int,
            reorder_point::int,
            (qty_on_hand <= reorder_point) AS needs_reorder,
            created_at::text,
            updated_at::text
          FROM maint.part
          WHERE ${filters.join(" AND ")}
          ORDER BY name ASC, sku ASC
        `,
        values
      );
      return result.rows;
    });

    return { rows };
  });

  app.post("/api/v1/maint/parts", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (_req, reply) => {
    return reply.code(410).send(GONE_BODY);
  });

  app.patch("/api/v1/maint/parts/:id", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (_req, reply) => {
    return reply.code(410).send(GONE_BODY);
  });
}
