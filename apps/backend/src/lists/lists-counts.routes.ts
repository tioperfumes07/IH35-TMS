import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { requireAuth } from "../auth/session-middleware.js";
import {
  buildModuleCountQuery,
  LISTS_MODULE_COUNT_SPECS,
  LISTS_MODULE_KEYS,
} from "./lists-module-count-spec.js";

const COMPANY_QUERY = z.object({
  operating_company_id: z.string().uuid(),
});

const MODULE_PARAM = z.enum(LISTS_MODULE_KEYS as [string, ...string[]]);

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: {
    query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
  }) => Promise<T>
) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [operatingCompanyId]);
    return fn(client);
  });
}

export async function countModuleRecords(
  client: { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> },
  module: string,
  operatingCompanyId: string
) {
  const specs = LISTS_MODULE_COUNT_SPECS[module] ?? [];
  // Resilience guard (P3): the count query references each spec table directly, so a single catalog
  // table that does not exist on this DB (prod migration drift — e.g. the catalogs.* tables created by
  // a later migration) makes the WHOLE domain query 42P01 → the endpoint 500s and the badge shows 0.
  // Skip missing tables via to_regclass so the domain degrades to the sum of the tables that DO exist
  // (or 0), and never 500s. After the missing tables are created the count fills in automatically.
  let presentSpecs = specs;
  if (specs.length > 0) {
    const qualified = specs.map((spec) => `${spec.schema ?? "catalogs"}.${spec.table}`);
    const existRes = await client.query<{ tbl: string }>(
      `SELECT t.tbl AS tbl FROM unnest($1::text[]) AS t(tbl) WHERE to_regclass(t.tbl) IS NOT NULL`,
      [qualified]
    );
    const existing = new Set(existRes.rows.map((row) => row.tbl));
    presentSpecs = specs.filter((spec) => existing.has(`${spec.schema ?? "catalogs"}.${spec.table}`));
  }
  const sql = buildModuleCountQuery(presentSpecs);
  const res = await client.query<{ count?: number }>(
    sql,
    presentSpecs.some((spec) => spec.companyScoped) ? [operatingCompanyId] : []
  );
  // journal_entry_types is now a real count-spec row, not a hardcoded literal added on top.
  //
  // LST-COUNT-01: a dropped table used to vanish silently, so the badge UNDERSTATED and looked
  // authoritative doing it — a number that is quietly wrong is worse than one that admits it. The
  // count still degrades rather than 500ing (that resilience is deliberate), but the omission is now
  // reported so it can never masquerade as a complete total.
  const missing = specs
    .filter((spec) => !presentSpecs.includes(spec))
    .map((spec) => `${spec.schema ?? "catalogs"}.${spec.table}`);
  return { count: Number(res.rows[0]?.count ?? 0), missing };
}

export async function registerListsCountsRoutes(app: FastifyInstance) {
  for (const module of LISTS_MODULE_KEYS) {
    app.get(`/api/v1/lists/${module}/count`, { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      const query = COMPANY_QUERY.safeParse(req.query ?? {});
      if (!query.success) return sendValidationError(reply, query.error);

      const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) =>
        countModuleRecords(client, module, query.data.operating_company_id)
      );
      if (result.missing.length > 0) {
        req.log.warn(
          { module, missing: result.missing },
          "lists count is DEGRADED — spec tables absent on this database; badge understates"
        );
      }
      // `degraded` is only present when something was actually dropped, so existing consumers that
      // read `.count` are unaffected.
      return result.missing.length > 0
        ? { count: result.count, degraded: true, missing_tables: result.missing }
        : { count: result.count };
    });
  }
}

export function isListsModuleKey(value: string): value is (typeof LISTS_MODULE_KEYS)[number] {
  return MODULE_PARAM.safeParse(value).success;
}
