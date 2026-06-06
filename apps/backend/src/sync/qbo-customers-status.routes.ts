import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withLuciaBypass } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user as { uuid: string; role: string };
}

function officeRole(role: string) {
  return role !== "Driver";
}

export type QboCustomersPushStatus = {
  total_local: number;
  synced: number;
  unsynced: number;
  pushing: number;
  failed: number;
  dead_letter: number;
};

export async function fetchQboCustomersPushStatus(operatingCompanyId: string): Promise<QboCustomersPushStatus> {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);

    const exists = await client.query(`SELECT to_regclass('accounting.qbo_customers') IS NOT NULL AS ok`);
    if (!exists.rows[0]?.ok) {
      return { total_local: 0, synced: 0, unsynced: 0, pushing: 0, failed: 0, dead_letter: 0 };
    }

    const res = await client.query<{
      total_local: string;
      synced: string;
      unsynced: string;
      pushing: string;
      failed: string;
      dead_letter: string;
    }>(
      `
        SELECT
          COUNT(*) FILTER (WHERE qbo_id IS NULL)::text AS total_local,
          COUNT(*) FILTER (WHERE qbo_id IS NOT NULL)::text AS synced,
          COUNT(*) FILTER (WHERE qbo_id IS NULL AND sync_status = 'unsynced')::text AS unsynced,
          COUNT(*) FILTER (WHERE qbo_id IS NULL AND sync_status = 'pushing')::text AS pushing,
          COUNT(*) FILTER (
            WHERE qbo_id IS NULL
              AND sync_status = 'failed'
              AND qbo_push_attempts < 5
          )::text AS failed,
          COUNT(*) FILTER (
            WHERE qbo_id IS NULL
              AND qbo_push_attempts >= 5
          )::text AS dead_letter
        FROM accounting.qbo_customers
        WHERE operating_company_id = $1::uuid
      `,
      [operatingCompanyId]
    );

    const row = res.rows[0];
    return {
      total_local: Number(row?.total_local ?? 0),
      synced: Number(row?.synced ?? 0),
      unsynced: Number(row?.unsynced ?? 0),
      pushing: Number(row?.pushing ?? 0),
      failed: Number(row?.failed ?? 0),
      dead_letter: Number(row?.dead_letter ?? 0),
    };
  });
}

export async function registerQboCustomersPushStatusRoutes(app: FastifyInstance) {
  app.get("/api/v1/sync/qbo-customers/status", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!officeRole(user.role)) return reply.code(403).send({ error: "forbidden" });

    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    await assertCompanyMembership(user.uuid, parsed.data.operating_company_id);

    const status = await fetchQboCustomersPushStatus(parsed.data.operating_company_id);
    return reply.send(status);
  });
}
