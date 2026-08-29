import { setScopedCompanyContext } from "../_helpers/scoped-company-context.js";
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

export type QboVendorsPushStatus = {
  // HOME-7A: a TRUE total (COUNT(*)) so Home renders "{synced}/{total}". `total_local` was
  // COUNT FILTER (qbo_id IS NULL) = the UNSYNCED count (0 in prod), which mislabeled Home as "872/0".
  // Canonical source = mdata.qbo_vendors (ACCT-ECON-05 / Rule 14). Sync columns
  // (sync_status / qbo_push_attempts / …) were added by mig 202607560000.
  total: number;
  total_local: number;
  synced: number;
  unsynced: number;
  pushing: number;
  failed: number;
  dead_letter: number;
};

export async function fetchQboVendorsPushStatus(
  authUserId: string,
  operatingCompanyId: string
): Promise<QboVendorsPushStatus> {
  return withCurrentUser(authUserId, async (client) => {
    await setScopedCompanyContext(client, authUserId, operatingCompanyId);

    const exists = await client.query(`SELECT to_regclass('mdata.qbo_vendors') IS NOT NULL AS ok`);
    if (!exists.rows[0]?.ok) {
      return { total: 0, total_local: 0, synced: 0, unsynced: 0, pushing: 0, failed: 0, dead_letter: 0 };
    }

    const res = await client.query<{
      total: string;
      total_local: string;
      synced: string;
      unsynced: string;
      pushing: string;
      failed: string;
      dead_letter: string;
    }>(
      `
        SELECT
          COUNT(*)::text AS total,
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
        FROM mdata.qbo_vendors
        WHERE operating_company_id = $1::uuid
      `,
      [operatingCompanyId]
    );

    const row = res.rows[0];
    return {
      total: Number(row?.total ?? 0),
      total_local: Number(row?.total_local ?? 0),
      synced: Number(row?.synced ?? 0),
      unsynced: Number(row?.unsynced ?? 0),
      pushing: Number(row?.pushing ?? 0),
      failed: Number(row?.failed ?? 0),
      dead_letter: Number(row?.dead_letter ?? 0),
    };
  });
}

export async function registerQboVendorsPushStatusRoutes(app: FastifyInstance) {
  app.get("/api/v1/sync/qbo-vendors/status", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!officeRole(user.role)) return reply.code(403).send({ error: "forbidden" });

    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });

    const status = await fetchQboVendorsPushStatus(user.uuid, parsed.data.operating_company_id);
    return reply.send(status);
  });
}
