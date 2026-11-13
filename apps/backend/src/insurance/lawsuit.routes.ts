import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { listLawsuitsQuerySchema } from "./claim.shared.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { excludeInsuranceFixtureSql } from "./insurance-visibility.js";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

/** ENG-60: insurance.lawsuit side table retired (0 rows). Creates/updates go through legal.matters type=lawsuit. */
const LAWSUIT_SIDE_TABLE_GONE = {
  error: "insurance_lawsuit_retired",
  message: "Create and edit lawsuits in Legal › Lawsuits (legal.matters type=lawsuit). insurance.lawsuit is retired (ENG-60).",
  redirect: "/legal/lawsuits",
} as const;

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

async function withCompanyScope<T>(userId: string, operatingCompanyId: string, fn: (client: Queryable) => Promise<T>) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [operatingCompanyId]);
    return fn(client as Queryable);
  });
}

function lawsuitSelectColumns(alias = "", includeClaimLinks = false) {
  const p = alias ? `${alias}.` : "";
  // ENG-60: table is legal.matters type=lawsuit; unmapped columns return NULL for API compat (0 rows).
  return `
    ${p}id::text,
    ${p}operating_company_id::text AS operating_company_id,
    ${p}case_number,
    NULL::text AS plaintiff,
    NULL::text AS defendant,
    NULL::text AS court_name,
    ${p}created_at::text AS filed_date,
    ${p}status,
    ${p}insurance_claim_id::text AS claim_id,
    NULL::bigint AS demand_cents,
    NULL::bigint AS settlement_cents,
    NULL::text AS attorney_name,
    NULL::text AS attorney_email,
    NULL::text AS notes,
    ${p}created_at::text${includeClaimLinks ? ",\n    claim.claim_number,\n    claim.driver_id::text AS driver_id,\n    NULLIF(TRIM(CONCAT(COALESCE(driver.first_name, ''), ' ', COALESCE(driver.last_name, ''))), '') AS driver_name,\n    asset.unit_id::text AS unit_id,\n    unit.unit_number" : ""}
  `;
}

export async function registerInsuranceLawsuitRoutes(app: FastifyInstance) {
  app.get("/api/v1/insurance/lawsuits", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const parsed = listLawsuitsQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });

    const rows = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const values: unknown[] = [parsed.data.operating_company_id];
      // INSURANCE-DASHBOARD-FIXTURE-LEAK: keep the Lawsuits list in parity with the Open Lawsuits KPI
      // (summary.routes.ts), which already excludes agent-created fixture rows.
      // ENG-60: source is legal.matters type=lawsuit (insurance.lawsuit dropped, 0 rows).
      const filters = ["lawsuit.operating_company_id = $1::uuid", "lawsuit.type = 'lawsuit'", excludeInsuranceFixtureSql("lawsuit.case_number")];
      if (parsed.data.status) {
        values.push(parsed.data.status);
        filters.push(`lawsuit.status = $${values.length}`);
      }
      if (parsed.data.claim_id) {
        values.push(parsed.data.claim_id);
        filters.push(`lawsuit.insurance_claim_id = $${values.length}::uuid`);
      }
      if (parsed.data.policy_id) {
        values.push(parsed.data.policy_id);
        filters.push(`claim.policy_id = $${values.length}::uuid`);
      }
      if (parsed.data.driver_id) {
        values.push(parsed.data.driver_id);
        filters.push(`claim.driver_id = $${values.length}::uuid`);
      }
      if (parsed.data.unit_id) {
        values.push(parsed.data.unit_id);
        filters.push(`asset.unit_id = $${values.length}::uuid`);
      }
      const result = await client.query(
        `
          SELECT ${lawsuitSelectColumns("lawsuit", true)}
          FROM legal.matters AS lawsuit
          LEFT JOIN insurance.claim AS claim
            ON claim.operating_company_id = lawsuit.operating_company_id
           AND claim.id = lawsuit.insurance_claim_id
          LEFT JOIN mdata.assets AS asset
            ON asset.operating_company_id = lawsuit.operating_company_id
           AND asset.id = claim.asset_id
          LEFT JOIN mdata.drivers AS driver
            ON driver.id = claim.driver_id
           AND driver.operating_company_id = lawsuit.operating_company_id
          LEFT JOIN mdata.units AS unit
            ON unit.id = asset.unit_id
           AND COALESCE(unit.currently_leased_to_company_id, unit.owner_company_id) = lawsuit.operating_company_id
          WHERE ${filters.join(" AND ")}
          ORDER BY lawsuit.created_at DESC
        `,
        values
      );
      return result.rows;
    });

    return { lawsuits: rows };
  });

  // ENG-60: mutate paths retired — FE creates lawsuits as legal.matters type=lawsuit.
  // Keep rate limits so a stale client cannot hammer the gone endpoints.
  app.post(
    "/api/v1/insurance/lawsuits",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = authUser(req, reply);
      if (!user) return;
      return reply.code(410).send(LAWSUIT_SIDE_TABLE_GONE);
    },
  );

  app.patch(
    "/api/v1/insurance/lawsuits/:id",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = authUser(req, reply);
      if (!user) return;
      return reply.code(410).send(LAWSUIT_SIDE_TABLE_GONE);
    },
  );
}
