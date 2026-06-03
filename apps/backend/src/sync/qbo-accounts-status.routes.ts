import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

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

export type QboAccountsPushStatus = {
  total_local: number;
  synced: number;
  unsynced: number;
  pushing: number;
  failed: number;
  dead_letter: number;
  root_synced: number;
  children_synced: number;
  blocked_by_parent: number;
};

export async function fetchQboAccountsPushStatus(
  authUserId: string,
  operatingCompanyId: string
): Promise<QboAccountsPushStatus> {
  return withCurrentUser(authUserId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);

    const exists = await client.query(`SELECT to_regclass('accounting.qbo_accounts') IS NOT NULL AS ok`);
    if (!exists.rows[0]?.ok) {
      return {
        total_local: 0,
        synced: 0,
        unsynced: 0,
        pushing: 0,
        failed: 0,
        dead_letter: 0,
        root_synced: 0,
        children_synced: 0,
        blocked_by_parent: 0,
      };
    }

    const res = await client.query<{
      total_local: string;
      synced: string;
      unsynced: string;
      pushing: string;
      failed: string;
      dead_letter: string;
      root_synced: string;
      children_synced: string;
      blocked_by_parent: string;
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
          )::text AS dead_letter,
          COUNT(*) FILTER (
            WHERE qbo_id IS NOT NULL
              AND parent_id IS NULL
          )::text AS root_synced,
          COUNT(*) FILTER (
            WHERE qbo_id IS NOT NULL
              AND parent_id IS NOT NULL
          )::text AS children_synced,
          COUNT(*) FILTER (
            WHERE qbo_id IS NULL
              AND parent_id IS NOT NULL
              AND NOT EXISTS (
                SELECT 1
                FROM accounting.qbo_accounts parent
                WHERE parent.id = accounting.qbo_accounts.parent_id
                  AND parent.operating_company_id = accounting.qbo_accounts.operating_company_id
                  AND parent.qbo_id IS NOT NULL
              )
          )::text AS blocked_by_parent
        FROM accounting.qbo_accounts
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
      root_synced: Number(row?.root_synced ?? 0),
      children_synced: Number(row?.children_synced ?? 0),
      blocked_by_parent: Number(row?.blocked_by_parent ?? 0),
    };
  });
}

export async function registerQboAccountsPushStatusRoutes(app: FastifyInstance) {
  app.get("/api/v1/sync/qbo-accounts/status", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!officeRole(user.role)) return reply.code(403).send({ error: "forbidden" });

    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });

    const status = await fetchQboAccountsPushStatus(user.uuid, parsed.data.operating_company_id);
    return reply.send(status);
  });
}
