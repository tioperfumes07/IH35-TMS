// Bank tie-out HTTP routes, split out of bank-tieout.service.ts (CC-2 2026-10-04) so the service — and the nightly cron
// that imports it — stays free of the auth middleware and session provider.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { computeTieouts, persistTieouts, tieoutDrill, todayCT, type DbClient } from "./bank-tieout.service.js";

const q = z.object({ operating_company_id: z.string().uuid(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
const p = z.object({ accountId: z.string().uuid() });

export async function registerBankTieoutRoutes(app: FastifyInstance) {
  // Live tie-out for one bank account (or all when accountId = "all" is not used): computed now, stored for the day.
  app.get("/api/v1/banking/accounts/:accountId/tieout", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    if (!requireAuth(req, reply)) return reply;
    const user = req.user;
    if (!user) return;
    const pp = p.safeParse(req.params ?? {});
    const qq = q.safeParse(req.query ?? {});
    if (!pp.success || !qq.success) return reply.code(400).send({ error: "validation_error" });
    await assertCompanyMembership(user.uuid, qq.data.operating_company_id);
    const day = qq.data.date ?? todayCT();
    const out = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [qq.data.operating_company_id]);
      const rows = await computeTieouts(client as DbClient, qq.data.operating_company_id, day, pp.data.accountId);
      if (day === todayCT()) await persistTieouts(client as DbClient, qq.data.operating_company_id, rows);
      const history = await (client as DbClient).query(
        `SELECT tieout_date::text, feed_balance_cents, gl_balance_cents, diff_cents, unexplained_cents, status
           FROM banking.bank_account_tieouts WHERE operating_company_id = $1::uuid AND bank_account_id = $2::uuid
          ORDER BY tieout_date DESC LIMIT 30`,
        [qq.data.operating_company_id, pp.data.accountId]
      );
      return { tieout: rows[0] ?? null, history: history.rows };
    });
    if (!out.tieout) return reply.code(404).send({ error: "bank_account_not_found_or_inactive" });
    return out;
  });

  app.get("/api/v1/banking/accounts/:accountId/tieout/drill", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    if (!requireAuth(req, reply)) return reply;
    const user = req.user;
    if (!user) return;
    const pp = p.safeParse(req.params ?? {});
    const qq = q.safeParse(req.query ?? {});
    if (!pp.success || !qq.success) return reply.code(400).send({ error: "validation_error" });
    await assertCompanyMembership(user.uuid, qq.data.operating_company_id);
    return withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [qq.data.operating_company_id]);
      return tieoutDrill(client as DbClient, qq.data.operating_company_id, pp.data.accountId, qq.data.date ?? todayCT());
    });
  });
}
