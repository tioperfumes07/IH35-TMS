import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { isBlockingDrugTestResult } from "./drug-program.shared.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
// COMP-01: one unified D&A prohibition source, shared with the dispatch qualification gate.
import { evaluateDriverDrugAlcoholStatus } from "../dispatch/driver-qualification.service.js";
import type { PoolClient } from "pg";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const driverParamsSchema = z.object({
  driver_id: z.string().uuid(),
});

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

const drugTestResultSchema = z.enum([
  "negative",
  "positive",
  "refusal",
  "adulterated",
  "substituted",
  "cancelled",
]);

const randomPoolStatusSchema = z.enum([
  "selected",
  "notified",
  "scheduled",
  "completed",
  "missed",
  "excused",
]);

const clearinghouseStatusSchema = z.enum(["clear", "record_found", "pending", "error"]);

const createDrugTestSchema = z.object({
  driver_id: z.string().uuid(),
  test_type: z.string().trim().min(1).default("random"),
  result: drugTestResultSchema,
  test_date: z.string(),
  lab_name: z.string().optional(),
  mro_name: z.string().optional(),
  notes: z.string().optional(),
});

const patchDrugTestSchema = z.object({
  test_type: z.string().trim().min(1).optional(),
  result: drugTestResultSchema.optional(),
  test_date: z.string().optional(),
  lab_name: z.string().nullable().optional(),
  mro_name: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  voided_reason: z.string().trim().min(1).optional(),
});

const createRandomPoolSchema = z.object({
  driver_id: z.string().uuid(),
  selection_period: z.string().trim().min(1),
  selection_seed: z.string().optional(),
  status: randomPoolStatusSchema.default("selected"),
  notes: z.string().optional(),
});

const createClearinghouseQuerySchema = z.object({
  driver_id: z.string().uuid(),
  query_status: clearinghouseStatusSchema,
  queried_at: z.string().optional(),
  consent_on_file: z.boolean().default(false),
  expires_at: z.string().optional(),
  notes: z.string().optional(),
  // SAF-F07-CH (gated batch item 4) — 49 CFR §382.701 distinguishes the PRE-EMPLOYMENT FULL query
  // from the ANNUAL LIMITED one. Without persisting which was run, the annual cadence cannot be
  // tracked and a DOT auditor cannot be shown that the obligation was met. reference_number +
  // document_id make the record answerable at audit instead of from memory.
  // Columns ship in migration 202607820000 — this lands with it.
  query_type: z.enum(["pre_employment_full", "annual_limited", "full"]).default("annual_limited"),
  reference_number: z.string().trim().max(200).optional(),
  document_id: z.string().uuid().optional(),
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

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: Queryable) => Promise<T>
) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [operatingCompanyId]);
    return fn(client as Queryable);
  });
}

export async function registerSafetyDrugProgramRoutes(app: FastifyInstance) {
  app.get("/api/v1/safety/drug-program/tests", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const company = companyQuerySchema.safeParse(req.query ?? {});
    if (!company.success) return reply.code(400).send({ error: "validation_error", details: company.error.flatten() });

    const tests = await withCompanyScope(user.uuid, company.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT
            t.*,
            NULLIF(TRIM(COALESCE(d.first_name, '') || ' ' || COALESCE(d.last_name, '')), '') AS driver_name
          FROM safety.drug_test t
          LEFT JOIN mdata.drivers d
            ON d.id = t.driver_id
           AND d.operating_company_id = t.operating_company_id
          WHERE t.operating_company_id = $1::uuid
            AND t.voided_at IS NULL
          ORDER BY t.test_date DESC, t.created_at DESC
          LIMIT 500
        `,
        [company.data.operating_company_id]
      );
      return res.rows;
    });

    return { tests };
  });

  app.post("/api/v1/safety/drug-program/tests", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const company = companyQuerySchema.safeParse(req.query ?? {});
    if (!company.success) return reply.code(400).send({ error: "validation_error", details: company.error.flatten() });
    const body = createDrugTestSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const created = await withCompanyScope(user.uuid, company.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          INSERT INTO safety.drug_test (
            operating_company_id,
            driver_id,
            test_type,
            result,
            test_date,
            lab_name,
            mro_name,
            notes
          )
          VALUES ($1, $2, $3, $4::safety.drug_test_result_enum, $5::date, $6, $7, $8)
          RETURNING *
        `,
        [
          company.data.operating_company_id,
          body.data.driver_id,
          body.data.test_type,
          body.data.result,
          body.data.test_date,
          body.data.lab_name ?? null,
          body.data.mro_name ?? null,
          body.data.notes ?? null,
        ]
      );
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.drug_test.created",
        {
          resource_type: "safety.drug_test",
          resource_id: (res.rows[0] as { id?: string })?.id ?? null,
          operating_company_id: company.data.operating_company_id,
          driver_id: body.data.driver_id,
          result: body.data.result,
        },
        isBlockingDrugTestResult(body.data.result) ? "warning" : "info",
        "P7-SAF-DRUG-PROGRAM"
      );
      return res.rows[0];
    });

    return reply.code(201).send(created);
  });

  app.patch("/api/v1/safety/drug-program/tests/:id", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const company = companyQuerySchema.safeParse(req.query ?? {});
    if (!company.success) return reply.code(400).send({ error: "validation_error", details: company.error.flatten() });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const body = patchDrugTestSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const updated = await withCompanyScope(user.uuid, company.data.operating_company_id, async (client) => {
      const existingRes = await client.query(
        `
          SELECT *
          FROM safety.drug_test
          WHERE id = $1
            AND operating_company_id = $2::uuid
            AND voided_at IS NULL
          LIMIT 1
        `,
        [params.data.id, company.data.operating_company_id]
      );
      if (!existingRes.rows[0]) return null;

      if (body.data.voided_reason) {
        const voidRes = await client.query(
          `
            UPDATE safety.drug_test
            SET voided_at = now(),
                voided_reason = $3,
                updated_at = now()
            WHERE id = $1
              AND operating_company_id = $2::uuid
              AND voided_at IS NULL
            RETURNING *
          `,
          [params.data.id, company.data.operating_company_id, body.data.voided_reason]
        );
        await appendCrudAudit(
          client,
          user.uuid,
          "safety.drug_test.voided",
          {
            resource_type: "safety.drug_test",
            resource_id: params.data.id,
            operating_company_id: company.data.operating_company_id,
          },
          "info",
          "P7-SAF-DRUG-PROGRAM"
        );
        return voidRes.rows[0];
      }

      const patchRes = await client.query(
        `
          UPDATE safety.drug_test
          SET test_type = COALESCE($3, test_type),
              result = COALESCE($4::safety.drug_test_result_enum, result),
              test_date = COALESCE($5::date, test_date),
              lab_name = COALESCE($6, lab_name),
              mro_name = COALESCE($7, mro_name),
              notes = COALESCE($8, notes),
              updated_at = now()
          WHERE id = $1
            AND operating_company_id = $2::uuid
            AND voided_at IS NULL
          RETURNING *
        `,
        [
          params.data.id,
          company.data.operating_company_id,
          body.data.test_type ?? null,
          body.data.result ?? null,
          body.data.test_date ?? null,
          body.data.lab_name ?? null,
          body.data.mro_name ?? null,
          body.data.notes ?? null,
        ]
      );
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.drug_test.updated",
        {
          resource_type: "safety.drug_test",
          resource_id: params.data.id,
          operating_company_id: company.data.operating_company_id,
          result: (patchRes.rows[0] as { result?: string })?.result ?? null,
        },
        isBlockingDrugTestResult(String((patchRes.rows[0] as { result?: string })?.result ?? "")) ? "warning" : "info",
        "P7-SAF-DRUG-PROGRAM"
      );
      return patchRes.rows[0];
    });

    if (!updated) return reply.code(404).send({ error: "drug_test_not_found" });
    return updated;
  });

  app.get("/api/v1/safety/drug-program/random-pools", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const company = companyQuerySchema.safeParse(req.query ?? {});
    if (!company.success) return reply.code(400).send({ error: "validation_error", details: company.error.flatten() });

    const rows = await withCompanyScope(user.uuid, company.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT
            p.*,
            NULLIF(TRIM(COALESCE(d.first_name, '') || ' ' || COALESCE(d.last_name, '')), '') AS driver_name
          FROM safety.random_pool p
          LEFT JOIN mdata.drivers d
            ON d.id = p.driver_id
           AND d.operating_company_id = p.operating_company_id
          WHERE p.operating_company_id = $1::uuid
            AND p.voided_at IS NULL
          ORDER BY p.selected_at DESC, p.created_at DESC
          LIMIT 500
        `,
        [company.data.operating_company_id]
      );
      return res.rows;
    });

    return { random_pools: rows };
  });

  app.post("/api/v1/safety/drug-program/random-pools", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const company = companyQuerySchema.safeParse(req.query ?? {});
    if (!company.success) return reply.code(400).send({ error: "validation_error", details: company.error.flatten() });
    const body = createRandomPoolSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const created = await withCompanyScope(user.uuid, company.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          INSERT INTO safety.random_pool (
            operating_company_id,
            driver_id,
            selection_period,
            selection_seed,
            status,
            notes
          )
          VALUES ($1, $2, $3, $4, $5::safety.random_pool_status_enum, $6)
          RETURNING *
        `,
        [
          company.data.operating_company_id,
          body.data.driver_id,
          body.data.selection_period,
          body.data.selection_seed ?? null,
          body.data.status,
          body.data.notes ?? null,
        ]
      );
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.random_pool.created",
        {
          resource_type: "safety.random_pool",
          resource_id: (res.rows[0] as { id?: string })?.id ?? null,
          operating_company_id: company.data.operating_company_id,
          driver_id: body.data.driver_id,
        },
        "info",
        "P7-SAF-DRUG-PROGRAM"
      );
      return res.rows[0];
    });

    return reply.code(201).send(created);
  });

  app.get("/api/v1/safety/drug-program/clearinghouse-queries", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const company = companyQuerySchema.safeParse(req.query ?? {});
    if (!company.success) return reply.code(400).send({ error: "validation_error", details: company.error.flatten() });

    const rows = await withCompanyScope(user.uuid, company.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT
            q.*,
            NULLIF(TRIM(COALESCE(d.first_name, '') || ' ' || COALESCE(d.last_name, '')), '') AS driver_name
          FROM safety.clearinghouse_query q
          LEFT JOIN mdata.drivers d
            ON d.id = q.driver_id
           AND d.operating_company_id = q.operating_company_id
          WHERE q.operating_company_id = $1::uuid
            AND q.voided_at IS NULL
          ORDER BY q.queried_at DESC
          LIMIT 500
        `,
        [company.data.operating_company_id]
      );
      return res.rows;
    });

    return { clearinghouse_queries: rows };
  });

  app.post("/api/v1/safety/drug-program/clearinghouse-queries", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const company = companyQuerySchema.safeParse(req.query ?? {});
    if (!company.success) return reply.code(400).send({ error: "validation_error", details: company.error.flatten() });
    const body = createClearinghouseQuerySchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const created = await withCompanyScope(user.uuid, company.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          INSERT INTO safety.clearinghouse_query (
            operating_company_id,
            driver_id,
            query_status,
            queried_at,
            consent_on_file,
            expires_at,
            notes,
            query_type,
            reference_number,
            document_id
          )
          VALUES (
            $1,
            $2,
            $3::safety.clearinghouse_query_status_enum,
            COALESCE($4::timestamptz, now()),
            $5,
            $6::date,
            $7,
            $8,
            $9,
            $10
          )
          RETURNING *
        `,
        [
          company.data.operating_company_id,
          body.data.driver_id,
          body.data.query_status,
          body.data.queried_at ?? null,
          body.data.consent_on_file,
          body.data.expires_at ?? null,
          body.data.notes ?? null,
          body.data.query_type,
          body.data.reference_number ?? null,
          body.data.document_id ?? null,
        ]
      );
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.clearinghouse_query.created",
        {
          resource_type: "safety.clearinghouse_query",
          resource_id: (res.rows[0] as { id?: string })?.id ?? null,
          operating_company_id: company.data.operating_company_id,
          driver_id: body.data.driver_id,
        },
        "info",
        "P7-SAF-DRUG-PROGRAM"
      );
      return res.rows[0];
    });

    return reply.code(201).send(created);
  });

  app.get("/api/v1/safety/drug-program/drivers/:driver_id/drug-status", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const company = companyQuerySchema.safeParse(req.query ?? {});
    if (!company.success) return reply.code(400).send({ error: "validation_error", details: company.error.flatten() });
    const params = driverParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });

    const status = await withCompanyScope(user.uuid, company.data.operating_company_id, async (client) => {
      const parent = await client.query(
        `SELECT 1 FROM mdata.drivers d
         WHERE d.id = $1::uuid
           AND d.archived_at IS NULL
           AND (
             d.operating_company_id = $2::uuid
             OR EXISTS (
               SELECT 1 FROM mdata.driver_company_authorizations dca
               WHERE dca.driver_id = d.id
                 AND dca.company_id = $2::uuid
                 AND dca.is_authorized = true
                 AND dca.deactivated_at IS NULL
             )
           )
         LIMIT 1`,
        [params.data.driver_id, company.data.operating_company_id]
      );
      if (!parent.rows[0]) return null;
      const latestTestRes = await client.query(
        `
          SELECT *
          FROM safety.drug_test
          WHERE operating_company_id = $1::uuid
            AND driver_id = $2
            AND voided_at IS NULL
          ORDER BY test_date DESC, created_at DESC
          LIMIT 1
        `,
        [company.data.operating_company_id, params.data.driver_id]
      );
      const latestTest = latestTestRes.rows[0] as { result?: string } | undefined;
      const result = String(latestTest?.result ?? "");

      // COMP-01: this screen-facing status used to be `isBlockingDrugTestResult(latest safety.drug_test
      // row)` and nothing else — no Clearinghouse, no safety.da_test_records, no
      // compliance.drug_alcohol_test_results, and latest-row-only (so a later routine negative made an
      // unresolved §382.501 prohibition disappear from the screen). Safety staff read this tile to
      // decide whether a driver may run. It now comes from the SAME evaluator the dispatch
      // qualification gate enforces with, so the screen and the gate cannot disagree.
      const daStatus = await evaluateDriverDrugAlcoholStatus(client as unknown as PoolClient, {
        driverId: params.data.driver_id,
        operatingCompanyId: company.data.operating_company_id,
      });

      return {
        driver_id: params.data.driver_id,
        is_blocked: daStatus.is_blocked,
        block_reason: daStatus.block_reason,
        // Which live source grounded the driver — audit trail, null when not blocked.
        block_source: daStatus.violation?.violation_source ?? (daStatus.is_blocked ? "safety.clearinghouse_query" : null),
        // Retained for display parity with the previous payload: the latest own-company drug test and
        // whether that single row is itself disqualifying. This is CONTEXT, never the verdict.
        latest_test: latestTest ?? null,
        latest_test_is_blocking: isBlockingDrugTestResult(result),
      };
    });

    if (!status) return reply.code(404).send({ error: "mdata_driver_not_found" });
    return status;
  });
}
