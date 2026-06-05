import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import {
  listActivePoolMembers,
  notifyRandomSelections,
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

const companyQuery = z.object({
  operating_company_id: z.string().uuid(),
  year: z.coerce.number().int().optional(),
  quarter: z.coerce.number().int().min(1).max(4).optional(),
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
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${companyId}'`);
    return fn(client as Queryable);
  });
}

export async function registerDrugAlcoholComplianceRoutes(app: FastifyInstance) {
  app.get("/api/v1/compliance/drug-alcohol/annual-rate-status", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const parsed = companyQuery.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const year = parsed.data.year ?? new Date().getUTCFullYear();
    const status = await withCompanyScope(user.uuid, parsed.data.operating_company_id, (client) =>
      fetchAnnualRateStatus(client as never, parsed.data.operating_company_id, year)
    );
    return reply.send(status);
  });

  app.get("/api/v1/compliance/drug-alcohol/pool", async (req, reply) => {
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

  app.get("/api/v1/compliance/drug-alcohol/draws", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const parsed = companyQuery.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const rows = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const draws = await client.query(
        `
          SELECT id::text, quarter, year, drug_count, alcohol_count, drawn_at::text, selection_seed
          FROM compliance.drug_alcohol_random_draws
          WHERE operating_company_id = $1::uuid
          ORDER BY year DESC, quarter DESC
          LIMIT 20
        `,
        [parsed.data.operating_company_id]
      );
      const selections = await client.query(
        `
          SELECT s.id::text, s.draw_id::text, s.driver_id::text, s.test_type, s.notified_at::text, s.completed_at::text
          FROM compliance.drug_alcohol_random_selections s
          JOIN compliance.drug_alcohol_random_draws d ON d.id = s.draw_id
          WHERE d.operating_company_id = $1::uuid
          ORDER BY s.created_at DESC
          LIMIT 100
        `,
        [parsed.data.operating_company_id]
      );
      return { draws: draws.rows, selections: selections.rows };
    });
    return reply.send(rows);
  });

  app.post("/api/v1/compliance/drug-alcohol/draws/run", async (req, reply) => {
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

    await notifyRandomSelections(parsed.data.operating_company_id, result.selections);
    return reply.send(result);
  });

  app.get("/api/v1/compliance/drug-alcohol/results", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const parsed = companyQuery.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const results = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT
            id::text, driver_id::text, test_date::text, test_type, test_reason, result,
            lab_id, mro_verified_at::text, clearinghouse_reported_at::text, clearinghouse_pending, notes
          FROM compliance.drug_alcohol_test_results
          WHERE operating_company_id = $1::uuid
          ORDER BY test_date DESC, created_at DESC
          LIMIT 200
        `,
        [parsed.data.operating_company_id]
      );
      return res.rows;
    });
    return reply.send({ results });
  });

  app.post("/api/v1/compliance/drug-alcohol/results", async (req, reply) => {
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

  app.get("/api/v1/compliance/drug-alcohol/rtd", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const parsed = companyQuery.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const processes = await withCompanyScope(user.uuid, parsed.data.operating_company_id, (client) =>
      listOpenRtdProcesses(client as never, parsed.data.operating_company_id)
    );
    return reply.send({ processes });
  });

  app.patch("/api/v1/compliance/drug-alcohol/results/:id/clearinghouse", async (req, reply) => {
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
