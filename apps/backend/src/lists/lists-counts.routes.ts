import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import {
  ACCOUNTING_JOURNAL_ENTRY_TYPES_COUNT,
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
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [operatingCompanyId]);
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
  let count = Number(res.rows[0]?.count ?? 0);
  if (module === "accounting") {
    count += ACCOUNTING_JOURNAL_ENTRY_TYPES_COUNT;
  }
  return count;
}

export async function registerListsCountsRoutes(app: FastifyInstance) {
  for (const module of LISTS_MODULE_KEYS) {
    app.get(`/api/v1/lists/${module}/count`, async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      const query = COMPANY_QUERY.safeParse(req.query ?? {});
      if (!query.success) return sendValidationError(reply, query.error);

      const count = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) =>
        countModuleRecords(client, module, query.data.operating_company_id)
      );
      return { count };
    });
  }
}

export function isListsModuleKey(value: string): value is (typeof LISTS_MODULE_KEYS)[number] {
  return MODULE_PARAM.safeParse(value).success;
}
