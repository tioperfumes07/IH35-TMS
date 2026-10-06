// Driver merge (owner 2026-10-06): one driver profile per person; many Samsara users may point at it.
// GET  /api/v1/drivers/duplicate-candidates — profiles that look like the same person (same name / CDL one char apart)
// GET  /api/v1/drivers/:id/merge-preview?merged_id= — what the merge would move, and any blocker
// POST /api/v1/drivers/:id/merge { merged_id, override_reason? } — Owner only; one transaction (driver-merge.service)
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withLuciaBypass } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { executeDriverMerge, listDuplicateDriverCandidates, previewDriverMerge } from "./driver-merge.service.js";

const companyQuery = z.object({ operating_company_id: z.string().uuid() });
const previewQuery = companyQuery.extend({ merged_id: z.string().uuid() });
const idParams = z.object({ id: z.string().uuid() });
const mergeBody = z.object({ merged_id: z.string().uuid(), override_reason: z.string().trim().max(2000).optional().nullable() });

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user as { uuid: string; role: string };
}
const isOffice = (role: string) => ["Owner", "Administrator", "Manager"].includes(role);

async function scoped<T>(userId: string, companyId: string, fn: (c: never) => Promise<T>) {
  return withLuciaBypass(
    async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1::uuid, true)", [companyId]);
      await client.query("SELECT set_config('app.current_user_id', $1::uuid, true)", [userId]);
      return fn(client as never);
    },
    { actorUserId: userId }
  );
}

export async function registerDriverMergeRoutes(app: FastifyInstance) {
  app.get("/api/v1/drivers/duplicate-candidates", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return reply;
    if (!isOffice(String(user.role))) return reply.code(403).send({ error: "forbidden" });
    const q = companyQuery.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "invalid_query", details: q.error.flatten() });
    await assertCompanyMembership(user.uuid, q.data.operating_company_id);
    const pairs = await scoped(user.uuid, q.data.operating_company_id, (c) => listDuplicateDriverCandidates(c, q.data.operating_company_id));
    return { pairs };
  });

  app.get("/api/v1/drivers/:id/merge-preview", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return reply;
    if (!isOffice(String(user.role))) return reply.code(403).send({ error: "forbidden" });
    const p = idParams.safeParse(req.params ?? {});
    const q = previewQuery.safeParse(req.query ?? {});
    if (!p.success || !q.success) return reply.code(400).send({ error: "invalid_request" });
    await assertCompanyMembership(user.uuid, q.data.operating_company_id);
    try {
      const preview = await scoped(user.uuid, q.data.operating_company_id, (c) =>
        previewDriverMerge(c, { companyId: q.data.operating_company_id, survivorId: p.data.id, mergedId: q.data.merged_id })
      );
      return preview;
    } catch (e) {
      if ((e as Error).message === "driver_merge_driver_not_found") return reply.code(404).send({ error: "driver_merge_driver_not_found" });
      throw e;
    }
  });

  app.post("/api/v1/drivers/:id/merge", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return reply;
    if (String(user.role) !== "Owner") return reply.code(403).send({ error: "owner_only" });
    const p = idParams.safeParse(req.params ?? {});
    const q = companyQuery.safeParse(req.query ?? {});
    const b = mergeBody.safeParse(req.body ?? {});
    if (!p.success || !q.success || !b.success) return reply.code(400).send({ error: "invalid_request" });
    await assertCompanyMembership(user.uuid, q.data.operating_company_id);
    const { createJournalEntryOnClient } = await import("../accounting/journal-entries.service.js");
    const { recordEscrowPostingOnly } = await import("../accounting/escrow/service.js");
    try {
      const result = await scoped(user.uuid, q.data.operating_company_id, (c) =>
        executeDriverMerge(
          c,
          {
            companyId: q.data.operating_company_id,
            survivorId: p.data.id,
            mergedId: b.data.merged_id,
            actorUserId: user.uuid,
            actorRole: String(user.role),
            overrideReason: b.data.override_reason ?? null,
          },
          { createJournalEntryOnClient: createJournalEntryOnClient as never, recordEscrowPostingOnly: recordEscrowPostingOnly as never }
        )
      );
      return { ok: true, ...result };
    } catch (e) {
      const err = e as Error & { details?: string[] };
      if (err.message.startsWith("driver_merge_")) return reply.code(409).send({ error: err.message, details: err.details ?? [] });
      throw e;
    }
  });
}
