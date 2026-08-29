import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import {
  createLawsuitBodySchema,
  INSURANCE_LAWSUIT_STATUSES,
  type InsuranceLawsuitStatus,
  lawsuitIdParamsSchema,
  listLawsuitsQuerySchema,
  operatingCompanySchema,
  updateLawsuitBodySchema,
} from "./claim.shared.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { excludeInsuranceFixtureSql } from "./insurance-visibility.js";
import { appendCrudAudit } from "../audit/crud-audit.js";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

const LAWSUIT_STATUS_TRANSITIONS: Record<InsuranceLawsuitStatus, readonly InsuranceLawsuitStatus[]> = {
  filed: ["active", "settled", "dismissed", "judgment"],
  active: ["settled", "dismissed", "judgment"],
  settled: [],
  dismissed: [],
  judgment: [],
};

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return reply;
  return req.user;
}

function canMutate(role: string) {
  return ["Owner", "Administrator", "Manager", "Accountant", "Dispatcher"].includes(role);
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
  return `
    ${p}id::text,
    ${p}tenant_id::text,
    ${p}case_number,
    ${p}plaintiff,
    ${p}defendant,
    ${p}court_name,
    ${p}filed_date::text,
    ${p}status,
    ${p}claim_id::text,
    ${p}demand_cents::bigint,
    ${p}settlement_cents::bigint,
    ${p}attorney_name,
    ${p}attorney_email,
    ${p}notes,
    ${p}created_at::text${includeClaimLinks ? ",\n    claim.claim_number,\n    claim.driver_id::text AS driver_id,\n    NULLIF(TRIM(CONCAT(COALESCE(driver.first_name, ''), ' ', COALESCE(driver.last_name, ''))), '') AS driver_name,\n    asset.unit_id::text AS unit_id,\n    unit.unit_number" : ""}
  `;
}

function canTransitionLawsuitStatus(currentStatus: InsuranceLawsuitStatus, nextStatus: InsuranceLawsuitStatus) {
  if (currentStatus === nextStatus) return true;
  return LAWSUIT_STATUS_TRANSITIONS[currentStatus].includes(nextStatus);
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
      const filters = ["lawsuit.tenant_id = $1::uuid", excludeInsuranceFixtureSql("lawsuit.case_number")];
      if (parsed.data.status) {
        values.push(parsed.data.status);
        filters.push(`lawsuit.status = $${values.length}`);
      }
      if (parsed.data.claim_id) {
        values.push(parsed.data.claim_id);
        filters.push(`lawsuit.claim_id = $${values.length}::uuid`);
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
          FROM insurance.lawsuit AS lawsuit
          LEFT JOIN insurance.claim AS claim
            ON claim.tenant_id = lawsuit.tenant_id
           AND claim.id = lawsuit.claim_id
          LEFT JOIN mdata.assets AS asset
            ON asset.tenant_id = lawsuit.tenant_id
           AND asset.id = claim.asset_id
          LEFT JOIN mdata.drivers AS driver
            ON driver.id = claim.driver_id
           AND driver.operating_company_id = lawsuit.tenant_id
          LEFT JOIN mdata.units AS unit
            ON unit.id = asset.unit_id
           AND COALESCE(unit.currently_leased_to_company_id, unit.owner_company_id) = lawsuit.tenant_id
          WHERE ${filters.join(" AND ")}
          ORDER BY lawsuit.filed_date DESC, lawsuit.created_at DESC
        `,
        values
      );
      return result.rows;
    });

    return { lawsuits: rows };
  });

  app.post(
    "/api/v1/insurance/lawsuits",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });

    const parsed = createLawsuitBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const body = parsed.data;

    const created = await withCompanyScope(user.uuid, body.operating_company_id, async (client) => {
      if (body.claim_id) {
        const claim = await client.query(
          `
            SELECT id::text
            FROM insurance.claim
            WHERE tenant_id = $1::uuid AND id = $2::uuid
            LIMIT 1
          `,
          [body.operating_company_id, body.claim_id]
        );
        if (!claim.rows[0]) return { kind: "claim_not_found" as const };
      }

      const result = await client.query(
        `
          INSERT INTO insurance.lawsuit (
            tenant_id,
            operating_company_id,
            case_number,
            plaintiff,
            defendant,
            court_name,
            filed_date,
            status,
            claim_id,
            demand_cents,
            settlement_cents,
            attorney_name,
            attorney_email,
            notes
          )
          VALUES (
            $1::uuid, $1::uuid, $2, $3, $4, $5, $6::date, $7, $8::uuid, $9, $10, $11, $12, $13
          )
          RETURNING ${lawsuitSelectColumns()}
        `,
        [
          body.operating_company_id,
          body.case_number,
          body.plaintiff,
          body.defendant,
          body.court_name,
          body.filed_date,
          body.status ?? "filed",
          body.claim_id ?? null,
          body.demand_cents,
          body.settlement_cents,
          body.attorney_name ?? null,
          body.attorney_email ?? null,
          body.notes ?? null,
        ]
      );
      const lawsuit = result.rows[0] as { id?: string } | undefined;
      if (!lawsuit?.id) throw new Error("insurance_lawsuit_insert_failed");
      await appendCrudAudit(client as never, user.uuid, "insurance.lawsuit.created", {
        resource_type: "insurance.lawsuit",
        resource_id: lawsuit.id,
        operating_company_id: body.operating_company_id,
        claim_id: body.claim_id ?? null,
      });
      return { kind: "ok" as const, row: lawsuit };
    });

    if (created.kind === "claim_not_found") return reply.code(404).send({ error: "claim_not_found" });
      return reply.code(201).send(created.row);
    }
  );

  app.patch("/api/v1/insurance/lawsuits/:id",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });

    const params = lawsuitIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const query = operatingCompanySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const bodyParsed = updateLawsuitBodySchema.safeParse(req.body ?? {});
    if (!bodyParsed.success) return reply.code(400).send({ error: "validation_error", details: bodyParsed.error.flatten() });
    const body = bodyParsed.data;

    const updated = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      if (body.claim_id !== undefined && body.claim_id !== null) {
        const claim = await client.query(
          `
            SELECT id::text
            FROM insurance.claim
            WHERE tenant_id = $1::uuid AND id = $2::uuid
            LIMIT 1
          `,
          [query.data.operating_company_id, body.claim_id]
        );
        if (!claim.rows[0]) return { kind: "claim_not_found" as const };
      }

      if (body.status) {
        const currentLawsuit = await client.query<{ status: InsuranceLawsuitStatus }>(
          `
            SELECT status
            FROM insurance.lawsuit
            WHERE tenant_id = $1::uuid AND id = $2::uuid
            LIMIT 1
            FOR UPDATE
          `,
          [query.data.operating_company_id, params.data.id]
        );
        const currentStatus = currentLawsuit.rows[0]?.status;
        if (!currentStatus) return { kind: "lawsuit_not_found" as const };
        if (!INSURANCE_LAWSUIT_STATUSES.includes(currentStatus)) return { kind: "lawsuit_not_found" as const };
        if (!canTransitionLawsuitStatus(currentStatus, body.status)) {
          return { kind: "invalid_status_transition" as const, from: currentStatus, to: body.status };
        }
      }

      const assignments: string[] = [];
      const values: unknown[] = [query.data.operating_company_id, params.data.id];
      const setField = (column: string, value: unknown, cast = "") => {
        values.push(value);
        assignments.push(`${column} = $${values.length}${cast}`);
      };

      if (body.case_number !== undefined) setField("case_number", body.case_number);
      if (body.plaintiff !== undefined) setField("plaintiff", body.plaintiff);
      if (body.defendant !== undefined) setField("defendant", body.defendant);
      if (body.court_name !== undefined) setField("court_name", body.court_name);
      if (body.filed_date !== undefined) setField("filed_date", body.filed_date, "::date");
      if (body.status !== undefined) setField("status", body.status);
      if (body.claim_id !== undefined) setField("claim_id", body.claim_id, "::uuid");
      if (body.demand_cents !== undefined) setField("demand_cents", body.demand_cents);
      if (body.settlement_cents !== undefined) setField("settlement_cents", body.settlement_cents);
      if (body.attorney_name !== undefined) setField("attorney_name", body.attorney_name);
      if (body.attorney_email !== undefined) setField("attorney_email", body.attorney_email);
      if (body.notes !== undefined) setField("notes", body.notes);

      const result = await client.query(
        `
          UPDATE insurance.lawsuit
          SET ${assignments.join(", ")}
          WHERE tenant_id = $1::uuid AND id = $2::uuid
          RETURNING ${lawsuitSelectColumns()}
        `,
        values
      );
      if (!result.rows[0]) return { kind: "lawsuit_not_found" as const };
      const lawsuit = result.rows[0] as { id?: string };
      await appendCrudAudit(client as never, user.uuid, "insurance.lawsuit.updated", {
        resource_type: "insurance.lawsuit",
        resource_id: lawsuit.id,
        operating_company_id: query.data.operating_company_id,
        claim_id: body.claim_id,
        status: body.status,
      });
      return { kind: "ok" as const, row: lawsuit };
    });

    if (updated.kind === "claim_not_found") return reply.code(404).send({ error: "claim_not_found" });
    if (updated.kind === "lawsuit_not_found") return reply.code(404).send({ error: "lawsuit_not_found" });
    if (updated.kind === "invalid_status_transition") {
      return reply.code(400).send({
        error: "invalid_status_transition",
        from: updated.from,
        to: updated.to,
      });
    }
    return updated.row;
    }
  );
}
