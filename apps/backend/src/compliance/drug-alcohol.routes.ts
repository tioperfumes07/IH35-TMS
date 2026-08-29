import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import {
  listActivePoolMembers,
  runQuarterlyRandomDraw,
  syncPoolFromCdlDrivers,
} from "./drug-alcohol-pool.js";
import {
  fetchAnnualRateStatus,
  listOpenRtdProcesses,
  recordTestResult,
  type TestReason,
  type TestResultType,
} from "./drug-alcohol-results.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { companyBusinessDate } from "../lib/company-business-date.js";

const companyQuery = z.object({
  operating_company_id: z.string().uuid(),
  year: z.coerce.number().int().optional(),
  quarter: z.coerce.number().int().min(1).max(4).optional(),
  draw_limit: z.coerce.number().int().min(1).max(50).default(5),
  draw_offset: z.coerce.number().int().min(0).default(0),
  selection_limit: z.coerce.number().int().min(1).max(100).default(12),
  selection_offset: z.coerce.number().int().min(0).default(0),
});

const createTestSchema = z.object({
  operating_company_id: z.string().uuid(),
  driver_id: z.string().uuid(),
  test_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  test_type: z.enum(["drug", "alcohol"]),
  test_reason: z.enum([
    "pre_employment",
    "random",
    "post_accident",
    "reasonable_suspicion",
    "return_to_duty",
    "follow_up",
  ]),
  result: z.enum(["negative", "positive", "refusal", "dilute"]),
  lab_id: z.string().optional(),
  notes: z.string().optional(),
});

const runDrawSchema = z.object({
  operating_company_id: z.string().uuid(),
  year: z.number().int(),
  quarter: z.number().int().min(1).max(4),
});

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function canMutate(role: string) {
  return ["Owner", "Administrator", "Manager", "Safety"].includes(role);
}

async function withCompanyScope<T>(userId: string, companyId: string, fn: (client: Queryable) => Promise<T>) {
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    return fn(client as Queryable);
  });
}

export async function registerDrugAlcoholComplianceRoutes(app: FastifyInstance) {
  app.get("/api/v1/compliance/drug-alcohol/annual-rate-status", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const parsed = companyQuery.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const year = parsed.data.year ?? Number(companyBusinessDate().slice(0, 4));
    const status = await withCompanyScope(user.uuid, parsed.data.operating_company_id, (client) =>
      fetchAnnualRateStatus(client as never, parsed.data.operating_company_id, year)
    );
    return reply.send(status);
  });

  app.get("/api/v1/compliance/drug-alcohol/pool", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const parsed = companyQuery.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const members = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      await syncPoolFromCdlDrivers(client as never, parsed.data.operating_company_id);
      return listActivePoolMembers(client as never, parsed.data.operating_company_id);
    });
    return reply.send({ members });
  });

  app.get("/api/v1/compliance/drug-alcohol/draws", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const parsed = companyQuery.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const rows = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const drawCount = await client.query<{ total_count: number }>(
        `SELECT count(*)::int AS total_count FROM compliance.drug_alcohol_random_draws WHERE operating_company_id = $1::uuid`,
        [parsed.data.operating_company_id]
      );
      const draws = await client.query(
        `
          SELECT id::text, quarter, year, drug_count, alcohol_count, drawn_at::text, selection_seed
          FROM compliance.drug_alcohol_random_draws
          WHERE operating_company_id = $1::uuid
          ORDER BY year DESC, quarter DESC, id DESC
          LIMIT $2 OFFSET $3
        `,
        [parsed.data.operating_company_id, parsed.data.draw_limit, parsed.data.draw_offset]
      );
      const selectionCount = await client.query<{ total_count: number }>(
        `SELECT count(*)::int AS total_count
         FROM compliance.drug_alcohol_random_selections s
         JOIN compliance.drug_alcohol_random_draws d ON d.id = s.draw_id
         WHERE d.operating_company_id = $1::uuid`,
        [parsed.data.operating_company_id]
      );
      const selections = await client.query(
        `
          SELECT
            s.id::text,
            s.draw_id::text,
            s.driver_id::text,
            NULLIF(TRIM(COALESCE(dr.first_name, '') || ' ' || COALESCE(dr.last_name, '')), '') AS driver_name,
            s.test_type,
            s.notified_at::text,
            s.completed_at::text
          FROM compliance.drug_alcohol_random_selections s
          JOIN compliance.drug_alcohol_random_draws d ON d.id = s.draw_id
          LEFT JOIN mdata.drivers dr
            ON dr.id = s.driver_id
           AND (dr.operating_company_id = d.operating_company_id OR EXISTS (
             SELECT 1 FROM mdata.driver_company_authorizations drug_draw_list_dca
             WHERE drug_draw_list_dca.driver_id = dr.id
               AND drug_draw_list_dca.company_id = d.operating_company_id
               AND drug_draw_list_dca.is_authorized = true
               AND drug_draw_list_dca.deactivated_at IS NULL
           ))
          WHERE d.operating_company_id = $1::uuid
          ORDER BY s.created_at DESC, s.id DESC
          LIMIT $2 OFFSET $3
        `,
        [parsed.data.operating_company_id, parsed.data.selection_limit, parsed.data.selection_offset]
      );
      return {
        draws: draws.rows,
        draw_total_count: Number(drawCount.rows[0]?.total_count ?? 0),
        selections: selections.rows,
        selection_total_count: Number(selectionCount.rows[0]?.total_count ?? 0),
      };
    });
    return reply.send(rows);
  });

  app.post("/api/v1/compliance/drug-alcohol/draws/run", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const parsed = runDrawSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });

    const result = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const draw = await runQuarterlyRandomDraw(
        client as never,
        parsed.data.operating_company_id,
        parsed.data.year,
        parsed.data.quarter
      );
      await appendCrudAudit(client as never, user.uuid, "compliance.drug_alcohol.random_draw", {
        resource_type: "compliance.drug_alcohol_random_draws",
        resource_id: draw.draw_id,
        year: draw.year,
        quarter: draw.quarter,
        selections: draw.selections.length,
      });
      return draw;
    });

    return reply.send(result);
  });

  app.get("/api/v1/compliance/drug-alcohol/results", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const parsed = companyQuery.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const results = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT
            t.id::text, t.driver_id::text,
            NULLIF(TRIM(COALESCE(d.first_name, '') || ' ' || COALESCE(d.last_name, '')), '') AS driver_name,
            t.test_date::text, t.test_type, t.test_reason, t.result,
            t.lab_id, t.mro_verified_at::text, t.clearinghouse_reported_at::text, t.clearinghouse_pending, t.notes
          FROM compliance.drug_alcohol_test_results t
          LEFT JOIN mdata.drivers d
            ON d.id = t.driver_id
           AND (d.operating_company_id = t.operating_company_id OR EXISTS (
             SELECT 1 FROM mdata.driver_company_authorizations drug_results_list_dca
             WHERE drug_results_list_dca.driver_id = d.id
               AND drug_results_list_dca.company_id = t.operating_company_id
               AND drug_results_list_dca.is_authorized = true
               AND drug_results_list_dca.deactivated_at IS NULL
           ))
          WHERE t.operating_company_id = $1::uuid
          ORDER BY t.test_date DESC, t.created_at DESC
          LIMIT 200
        `,
        [parsed.data.operating_company_id]
      );
      return res.rows;
    });
    return reply.send({ results });
  });

  app.post("/api/v1/compliance/drug-alcohol/results", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const parsed = createTestSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });

    const created = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const row = await recordTestResult(client as never, parsed.data.operating_company_id, {
        driver_id: parsed.data.driver_id,
        test_date: parsed.data.test_date,
        test_type: parsed.data.test_type,
        test_reason: parsed.data.test_reason as TestReason,
        result: parsed.data.result as TestResultType,
        lab_id: parsed.data.lab_id,
        notes: parsed.data.notes,
      });
      await appendCrudAudit(
        client as never,
        user.uuid,
        "compliance.drug_alcohol.test_recorded",
        {
          resource_type: "compliance.drug_alcohol_test_results",
          resource_id: row.id,
          result: parsed.data.result,
          driver_id: parsed.data.driver_id,
        },
        parsed.data.result === "positive" ? "warning" : "info"
      );
      return row;
    });
    return reply.send(created);
  });

  app.get("/api/v1/compliance/drug-alcohol/rtd", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const parsed = companyQuery.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const processes = await withCompanyScope(user.uuid, parsed.data.operating_company_id, (client) =>
      listOpenRtdProcesses(client as never, parsed.data.operating_company_id)
    );
    return reply.send({ processes });
  });

  app.patch("/api/v1/compliance/drug-alcohol/results/:id/clearinghouse", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
    const body = z
      .object({
        operating_company_id: z.string().uuid(),
        clearinghouse_reported_at: z.string().datetime().optional(),
      })
      .safeParse(req.body ?? {});
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: "validation_error" });
    }

    const updated = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE compliance.drug_alcohol_test_results
          SET clearinghouse_reported_at = COALESCE($3::timestamptz, now()),
              clearinghouse_pending = false,
              updated_at = now()
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
            AND result = 'positive'
          RETURNING id::text
        `,
        [params.data.id, body.data.operating_company_id, body.data.clearinghouse_reported_at ?? null]
      );
      return res.rows[0]?.id ?? null;
    });
    if (!updated) return reply.code(404).send({ error: "not_found" });
    return reply.send({ ok: true, id: updated });
  });
}
