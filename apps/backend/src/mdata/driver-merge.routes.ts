// Driver merge (owner 2026-10-06): one driver profile per person; many Samsara users may point at it.
// GET  /api/v1/drivers/duplicate-candidates — profiles that look like the same person (same name / CDL one char apart)
// GET  /api/v1/drivers/:id/merge-preview?merged_id= — what the merge would move, and any blocker
// POST /api/v1/drivers/:id/merge { merged_id, override_reason? } — Owner only; one transaction (driver-merge.service)
// POST /api/v1/drivers/merge-all { dry_run } — Owner only (LEAD 443.270-C c): every SAME-NAME candidate pair, one engine run
//      each; a near-CDL pair is listed for a single merge, never batch-merged.
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
  await assertCompanyMembership(userId, companyId);
  return withLuciaBypass(
    async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
      await client.query("SELECT set_config('app.current_user_id', $1::text, true)", [userId]);
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
      // AJK-05 (443.113): a GET never writes — the preview runs in a READ ONLY transaction, so any write is refused (25006).
      const preview = await scoped(user.uuid, q.data.operating_company_id, async (c) => {
        await (c as { query: (sql: string) => Promise<unknown> }).query("SET LOCAL transaction_read_only = on");
        return previewDriverMerge(c, { companyId: q.data.operating_company_id, survivorId: p.data.id, mergedId: q.data.merged_id });
      });
      return preview;
    } catch (e) {
      if ((e as Error).message === "driver_merge_driver_not_found") return reply.code(404).send({ error: "driver_merge_driver_not_found" });
      throw e;
    }
  });

  app.post("/api/v1/drivers/merge-all", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return reply;
    if (String(user.role) !== "Owner") return reply.code(403).send({ error: "owner_only" });
    const b = companyQuery.extend({ dry_run: z.boolean().default(true) }).safeParse(req.body ?? {});
    if (!b.success) return reply.code(400).send({ error: "invalid_request" });
    const oc = b.data.operating_company_id;
    await assertCompanyMembership(user.uuid, oc);
    type Pair = { survivor: { id: string }; merged: Array<{ id: string }>; why: string[] };
    const before = (await scoped(user.uuid, oc, (c) => listDuplicateDriverCandidates(c, oc))) as unknown as Pair[];
    const sameName = before.filter((p) => p.why.includes("same name"));
    const listedOnly = before.filter((p) => !p.why.includes("same name"));
    if (b.data.dry_run) return { dry_run: true, pairs_before: before.length, batch: sameName, single_merge_only: listedOnly };
    const { createJournalEntryOnClient } = await import("../accounting/journal-entries.service.js");
    const { recordEscrowPostingOnly } = await import("../accounting/escrow/service.js");
    const merged: unknown[] = [];
    const refused: Array<{ survivor_id: string; merged_id: string; error: string; details?: string[] }> = [];
    for (const p of sameName) {
      for (const m of p.merged) {
        try {
          merged.push(await scoped(user.uuid, oc, (c) => executeDriverMerge(c,
            { companyId: oc, survivorId: p.survivor.id, mergedId: m.id, actorUserId: user.uuid, actorRole: String(user.role), overrideReason: null },
            { createJournalEntryOnClient: createJournalEntryOnClient as never, recordEscrowPostingOnly: recordEscrowPostingOnly as never })));
        } catch (e) {
          const err = e as Error & { details?: string[] };
          refused.push({ survivor_id: p.survivor.id, merged_id: m.id, error: err.message, details: err.details });
        }
      }
    }
    const after = (await scoped(user.uuid, oc, (c) => listDuplicateDriverCandidates(c, oc))) as unknown as Pair[];
    return { dry_run: false, pairs_before: before.length, pairs_after: after.length, merged, refused, single_merge_only: listedOnly };
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
