/**
 * SYS-F-TRANSACTION-HEALTH-REGISTER (TXH-01, GO-0010).
 *
 * GET /api/v1/system/transaction-health — owner-only, read-only, entity-scoped, cursor-paginated.
 * See transaction-health.service.ts for the full design rationale. This file is intentionally thin:
 * auth, param parsing, the bypass_rls transaction, and response shaping only — no query logic here.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withLuciaBypass } from "../auth/db.js";
import { decodeTxHealthCursor, fetchTransactionHealth } from "./transaction-health.service.js";

const querySchema = z.object({
  // Zero or more explicit entity filters; omitted/empty means "every active company" (TRANSP +
  // USMCA + TRK today) — the spec's own "not USMCA-only" requirement. Fastify gives a repeated
  // ?operating_company_id=a&operating_company_id=b as a string[]; a single value arrives as a bare
  // string, so both shapes are accepted.
  operating_company_id: z.union([z.string().uuid(), z.array(z.string().uuid())]).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  issues_only: z.coerce.boolean().optional().default(true),
});

function currentOwner(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  const user = req.user;
  if (!user || user.role !== "Owner") {
    void reply.code(403).send({ error: "forbidden_owner_only" });
    return null;
  }
  return user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

export async function registerTransactionHealthRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/system/transaction-health",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentOwner(req, reply);
      if (!user) return;

      const query = querySchema.safeParse(req.query ?? {});
      if (!query.success) return sendValidationError(reply, query.error);

      const cursor = decodeTxHealthCursor(query.data.cursor);
      if (query.data.cursor && !cursor) return reply.code(400).send({ error: "invalid_cursor" });

      const requested = query.data.operating_company_id
        ? Array.isArray(query.data.operating_company_id)
          ? query.data.operating_company_id
          : [query.data.operating_company_id]
        : [];

      // GUC bypass (own SET LOCAL statement, per TXH-01's explicit "never CTE" requirement) — this is
      // an Owner cross-entity surface by design (TRANSP + USMCA + TRK together), so normal per-company
      // RLS scoping is the wrong tool here. Every query in the service filters explicitly by
      // operating_company_id = ANY($1) instead — see CLAUDE.md's "RLS is NOT a backstop for Owner
      // sessions" law: an unscoped read here would be load-bearing on nothing.
      const result = await withLuciaBypass(async (client) => {
        const activeRes = await client.query<{ id: string; code: string }>(
          `SELECT id::text AS id, code FROM org.companies WHERE is_active = true AND deactivated_at IS NULL ORDER BY code`
        );
        const active = activeRes.rows;
        const activeIds = new Set(active.map((c) => c.id));

        const operatingCompanyIds =
          requested.length > 0 ? requested.filter((id) => activeIds.has(id)) : active.map((c) => c.id);

        if (operatingCompanyIds.length === 0) {
          return { rows: [], next_cursor: null, entities: active.map((c) => ({ id: c.id, code: c.code })) };
        }

        const page = await fetchTransactionHealth(client, {
          operatingCompanyIds,
          cursor,
          limit: query.data.limit,
          issuesOnly: query.data.issues_only,
        });

        return { ...page, entities: active.map((c) => ({ id: c.id, code: c.code })) };
      }, { actorUserId: user.uuid });

      return {
        rows: result.rows,
        next_cursor: result.next_cursor,
        entities: result.entities,
        generated_at: new Date().toISOString(),
      };
    }
  );
}
