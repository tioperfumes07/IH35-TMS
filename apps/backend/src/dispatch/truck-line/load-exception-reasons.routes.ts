/**
 * TRUCK LINE — GET /api/v1/catalogs/load-exception-reasons.
 *
 * Read-only list of the (owner-authored) exception reasons for the "Other" station pop-up.
 * catalogs.load_exception_reasons is CC-1's migration (Lead assignment, deadline 2026-09-11
 * 23:30 UTC) — this route degrades gracefully (empty list, catalog_ready: false) until that table
 * exists, so the Truck Line frontend never has to hardcode a reason name/list while it waits.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { currentAuthUser, withCompanyScope } from "../../accounting/shared.js";

const querySchema = z.object({ operating_company_id: z.string().uuid() });

export async function registerLoadExceptionReasonsRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/catalogs/load-exception-reasons",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      const parsed = querySchema.safeParse(req.query ?? {});
      if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });

      const payload = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
        const tableRes = await client.query(`SELECT to_regclass('catalogs.load_exception_reasons') IS NOT NULL AS ok`);
        const catalogReady = Boolean((tableRes.rows[0] as { ok?: boolean } | undefined)?.ok);
        if (!catalogReady) return { reasons: [] as { id: string; code: string; name: string; is_active: boolean }[], catalogReady };

        const res = await client.query(
          `
            SELECT id::text, code, name, is_active
            FROM catalogs.load_exception_reasons
            WHERE operating_company_id = $1::uuid AND is_active = true
            ORDER BY sort_order ASC NULLS LAST, name ASC
          `,
          [parsed.data.operating_company_id]
        );
        return { reasons: res.rows as { id: string; code: string; name: string; is_active: boolean }[], catalogReady };
      });

      return reply.code(200).send({ reasons: payload.reasons, catalog_ready: payload.catalogReady });
    }
  );
}
