import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import {
  canCloseRtdCase,
  isDispatchBlockedByRtd,
  isLegalRtdAdvance,
  isRtdStage,
  nextRtdStage,
  requiresNegativeRtdTest,
  RTD_STAGES,
  type RtdStage,
} from "./rtd.shared.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const driverParamsSchema = z.object({
  driver_id: z.string().uuid(),
});

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

const createRtdCaseSchema = z.object({
  driver_id: z.string().uuid(),
  triggered_by_test_id: z.string().uuid().optional(),
  sap_name: z.string().optional(),
  follow_up_tests_required: z.coerce.number().int().min(0).optional(),
  reprimand_notes: z.string().optional(),
  training_records_url: z.string().optional(),
});

const advanceRtdCaseSchema = z.object({
  target_stage: z.enum(RTD_STAGES),
  sap_name: z.string().optional(),
  sap_eval_date: z.string().optional(),
  rtd_test_id: z.string().uuid().optional(),
  follow_up_plan: z.string().optional(),
  follow_up_tests_completed: z.coerce.number().int().min(0).optional(),
  follow_up_tests_required: z.coerce.number().int().min(0).optional(),
  reprimand_notes: z.string().optional(),
  training_records_url: z.string().optional(),
  clearinghouse_updated: z.boolean().optional(),
});

const patchRtdCaseSchema = z.object({
  sap_name: z.string().nullable().optional(),
  sap_eval_date: z.string().nullable().optional(),
  follow_up_plan: z.string().nullable().optional(),
  follow_up_tests_completed: z.coerce.number().int().min(0).optional(),
  follow_up_tests_required: z.coerce.number().int().min(0).nullable().optional(),
  reprimand_notes: z.string().nullable().optional(),
  training_records_url: z.string().nullable().optional(),
  clearinghouse_updated: z.boolean().optional(),
});

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

type RtdCaseRow = {
  id: string;
  operating_company_id: string;
  driver_id: string;
  triggered_by_test_id: string | null;
  stage: RtdStage;
  sap_name: string | null;
  sap_eval_date: string | null;
  rtd_test_id: string | null;
  follow_up_plan: string | null;
  follow_up_tests_completed: number;
  follow_up_tests_required: number | null;
  opened_at: string;
  closed_at: string | null;
  reprimand_notes: string | null;
  training_records_url: string | null;
  clearinghouse_updated: boolean;
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
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [operatingCompanyId]);
    return fn(client as Queryable);
  });
}

function enrichRtdCase(row: RtdCaseRow) {
  const stage = row.stage;
  return {
    ...row,
    dispatch_blocked: isDispatchBlockedByRtd(stage, Boolean(row.clearinghouse_updated)),
    next_stage: nextRtdStage(stage),
    can_close: canCloseRtdCase(stage, Boolean(row.clearinghouse_updated)),
  };
}

async function loadRtdCase(client: Queryable, companyId: string, caseId: string) {
  const res = await client.query<RtdCaseRow>(
    `
      SELECT
        id::text,
        operating_company_id::text,
        driver_id::text,
        triggered_by_test_id::text,
        stage::text AS stage,
        sap_name,
        sap_eval_date::text,
        rtd_test_id::text,
        follow_up_plan,
        follow_up_tests_completed,
        follow_up_tests_required,
        opened_at::text,
        closed_at::text,
        reprimand_notes,
        training_records_url,
        clearinghouse_updated
      FROM safety.rtd_case
      WHERE operating_company_id = $1
        AND id = $2
        AND voided_at IS NULL
      LIMIT 1
    `,
    [companyId, caseId]
  );
  return res.rows[0] ?? null;
}

async function validateRtdTestForAdvance(
  client: Queryable,
  companyId: string,
  driverId: string,
  rtdTestId: string
) {
  const res = await client.query<{ id: string; test_type: string; result: string }>(
    `
      SELECT id::text, test_type, result::text
      FROM safety.drug_test
      WHERE operating_company_id = $1
        AND driver_id = $2
        AND id = $3
        AND voided_at IS NULL
      LIMIT 1
    `,
    [companyId, driverId, rtdTestId]
  );
  const row = res.rows[0];
  if (!row) return { ok: false as const, reason: "rtd_test_not_found" };
  const testType = String(row.test_type ?? "").toLowerCase();
  const result = String(row.result ?? "").toLowerCase();
  if (!testType.includes("return") && testType !== "return_to_duty" && testType !== "rtd") {
    return { ok: false as const, reason: "rtd_test_must_be_return_to_duty_type" };
  }
  if (result !== "negative") {
    return { ok: false as const, reason: "rtd_test_must_be_negative" };
  }
  return { ok: true as const };
}

export async function registerSafetyRtdRoutes(app: FastifyInstance) {
  app.get("/api/v1/safety/rtd/cases", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const company = companyQuerySchema.safeParse(req.query ?? {});
    if (!company.success) return reply.code(400).send({ error: "validation_error", details: company.error.flatten() });

    const cases = await withCompanyScope(user.uuid, company.data.operating_company_id, async (client) => {
      const res = await client.query<RtdCaseRow>(
        `
          SELECT
            id::text,
            operating_company_id::text,
            driver_id::text,
            triggered_by_test_id::text,
            stage::text AS stage,
            sap_name,
            sap_eval_date::text,
            rtd_test_id::text,
            follow_up_plan,
            follow_up_tests_completed,
            follow_up_tests_required,
            opened_at::text,
            closed_at::text,
            reprimand_notes,
            training_records_url,
            clearinghouse_updated
          FROM safety.rtd_case
          WHERE operating_company_id = $1
            AND voided_at IS NULL
          ORDER BY opened_at DESC, created_at DESC
          LIMIT 500
        `,
        [company.data.operating_company_id]
      );
      return res.rows.map(enrichRtdCase);
    });

    return { cases };
  });

  app.get("/api/v1/safety/rtd/drivers/:driver_id/case", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const company = companyQuerySchema.safeParse(req.query ?? {});
    if (!company.success) return reply.code(400).send({ error: "validation_error", details: company.error.flatten() });
    const params = driverParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });

    const payload = await withCompanyScope(user.uuid, company.data.operating_company_id, async (client) => {
      const res = await client.query<RtdCaseRow>(
        `
          SELECT
            id::text,
            operating_company_id::text,
            driver_id::text,
            triggered_by_test_id::text,
            stage::text AS stage,
            sap_name,
            sap_eval_date::text,
            rtd_test_id::text,
            follow_up_plan,
            follow_up_tests_completed,
            follow_up_tests_required,
            opened_at::text,
            closed_at::text,
            reprimand_notes,
            training_records_url,
            clearinghouse_updated
          FROM safety.rtd_case
          WHERE operating_company_id = $1
            AND driver_id = $2
            AND voided_at IS NULL
          ORDER BY
            CASE WHEN stage = 'complete' THEN 1 ELSE 0 END,
            opened_at DESC,
            created_at DESC
          LIMIT 1
        `,
        [company.data.operating_company_id, params.data.driver_id]
      );
      const row = res.rows[0];
      return row ? enrichRtdCase(row) : null;
    });

    return { case: payload };
  });

  app.post("/api/v1/safety/rtd/cases", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const company = companyQuerySchema.safeParse(req.query ?? {});
    if (!company.success) return reply.code(400).send({ error: "validation_error", details: company.error.flatten() });
    const body = createRtdCaseSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const created = await withCompanyScope(user.uuid, company.data.operating_company_id, async (client) => {
      const openRes = await client.query<{ id: string; stage: string }>(
        `
          SELECT id::text, stage::text
          FROM safety.rtd_case
          WHERE operating_company_id = $1
            AND driver_id = $2
            AND voided_at IS NULL
            AND stage <> 'complete'
          LIMIT 1
        `,
        [company.data.operating_company_id, body.data.driver_id]
      );
      if (openRes.rows[0]) {
        throw Object.assign(new Error("open_rtd_case_exists"), { code: "E_RTD_OPEN_CASE_EXISTS" });
      }

      const res = await client.query<RtdCaseRow>(
        `
          INSERT INTO safety.rtd_case (
            operating_company_id,
            driver_id,
            triggered_by_test_id,
            stage,
            sap_name,
            follow_up_tests_required,
            reprimand_notes,
            training_records_url
          )
          VALUES ($1, $2, $3, 'removed', $4, $5, $6, $7)
          RETURNING
            id::text,
            operating_company_id::text,
            driver_id::text,
            triggered_by_test_id::text,
            stage::text AS stage,
            sap_name,
            sap_eval_date::text,
            rtd_test_id::text,
            follow_up_plan,
            follow_up_tests_completed,
            follow_up_tests_required,
            opened_at::text,
            closed_at::text,
            reprimand_notes,
            training_records_url,
            clearinghouse_updated
        `,
        [
          company.data.operating_company_id,
          body.data.driver_id,
          body.data.triggered_by_test_id ?? null,
          body.data.sap_name ?? null,
          body.data.follow_up_tests_required ?? null,
          body.data.reprimand_notes ?? null,
          body.data.training_records_url ?? null,
        ]
      );
      const row = res.rows[0];
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.rtd_case.created",
        {
          resource_type: "safety.rtd_case",
          resource_id: row?.id ?? null,
          operating_company_id: company.data.operating_company_id,
          driver_id: body.data.driver_id,
        },
        "info",
        "P7-SAF-RTD-SAP"
      );
      return enrichRtdCase(row);
    }).catch((error: Error & { code?: string }) => {
      if (error.code === "E_RTD_OPEN_CASE_EXISTS") {
        reply.code(409).send({ error: error.code, message: "Driver already has an open RTD case." });
        return null;
      }
      throw error;
    });

    if (!created) return;
    return reply.code(201).send(created);
  });

  app.post("/api/v1/safety/rtd/cases/:id/advance", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const company = companyQuerySchema.safeParse(req.query ?? {});
    if (!company.success) return reply.code(400).send({ error: "validation_error", details: company.error.flatten() });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const body = advanceRtdCaseSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const targetStage = body.data.target_stage;
    if (!isRtdStage(targetStage)) {
      return reply.code(400).send({ error: "validation_error", message: "Invalid RTD stage." });
    }

    const updated = await withCompanyScope(user.uuid, company.data.operating_company_id, async (client) => {
      const current = await loadRtdCase(client, company.data.operating_company_id, params.data.id);
      if (!current) {
        throw Object.assign(new Error("not_found"), { code: "E_RTD_CASE_NOT_FOUND" });
      }
      if (!isLegalRtdAdvance(current.stage, targetStage)) {
        throw Object.assign(new Error("illegal_transition"), { code: "E_RTD_ILLEGAL_TRANSITION" });
      }

      if (requiresNegativeRtdTest(targetStage)) {
        const rtdTestId = body.data.rtd_test_id ?? current.rtd_test_id;
        if (!rtdTestId) {
          throw Object.assign(new Error("missing_rtd_test"), { code: "E_RTD_NEGATIVE_TEST_REQUIRED" });
        }
        const validation = await validateRtdTestForAdvance(
          client,
          company.data.operating_company_id,
          current.driver_id,
          rtdTestId
        );
        if (!validation.ok) {
          throw Object.assign(new Error(validation.reason), { code: "E_RTD_NEGATIVE_TEST_REQUIRED" });
        }
      }

      const clearinghouseUpdated =
        targetStage === "complete"
          ? Boolean(body.data.clearinghouse_updated ?? current.clearinghouse_updated)
          : Boolean(current.clearinghouse_updated);
      if (targetStage === "complete" && !clearinghouseUpdated) {
        throw Object.assign(new Error("clearinghouse_required"), { code: "E_RTD_CLEARINGHOUSE_REQUIRED" });
      }

      const closedAt = targetStage === "complete" ? new Date().toISOString() : null;
      const res = await client.query<RtdCaseRow>(
        `
          UPDATE safety.rtd_case
          SET
            stage = $3::safety.rtd_stage_enum,
            sap_name = COALESCE($4, sap_name),
            sap_eval_date = COALESCE($5::date, sap_eval_date),
            rtd_test_id = COALESCE($6::uuid, rtd_test_id),
            follow_up_plan = COALESCE($7, follow_up_plan),
            follow_up_tests_completed = COALESCE($8, follow_up_tests_completed),
            follow_up_tests_required = COALESCE($9, follow_up_tests_required),
            reprimand_notes = COALESCE($10, reprimand_notes),
            training_records_url = COALESCE($11, training_records_url),
            clearinghouse_updated = $12,
            closed_at = COALESCE($13::timestamptz, closed_at)
          WHERE operating_company_id = $1
            AND id = $2
            AND voided_at IS NULL
          RETURNING
            id::text,
            operating_company_id::text,
            driver_id::text,
            triggered_by_test_id::text,
            stage::text AS stage,
            sap_name,
            sap_eval_date::text,
            rtd_test_id::text,
            follow_up_plan,
            follow_up_tests_completed,
            follow_up_tests_required,
            opened_at::text,
            closed_at::text,
            reprimand_notes,
            training_records_url,
            clearinghouse_updated
        `,
        [
          company.data.operating_company_id,
          params.data.id,
          targetStage,
          body.data.sap_name ?? null,
          body.data.sap_eval_date ?? null,
          body.data.rtd_test_id ?? null,
          body.data.follow_up_plan ?? null,
          body.data.follow_up_tests_completed ?? null,
          body.data.follow_up_tests_required ?? null,
          body.data.reprimand_notes ?? null,
          body.data.training_records_url ?? null,
          clearinghouseUpdated,
          closedAt,
        ]
      );
      const row = res.rows[0];
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.rtd_case.advanced",
        {
          resource_type: "safety.rtd_case",
          resource_id: row?.id ?? null,
          operating_company_id: company.data.operating_company_id,
          driver_id: current.driver_id,
          from_stage: current.stage,
          to_stage: targetStage,
          dispatch_blocked: isDispatchBlockedByRtd(targetStage, clearinghouseUpdated),
        },
        "info",
        "P7-SAF-RTD-SAP"
      );
      return enrichRtdCase(row);
    }).catch((error: Error & { code?: string }) => {
      if (error.code === "E_RTD_CASE_NOT_FOUND") {
        reply.code(404).send({ error: error.code, message: "RTD case not found." });
        return null;
      }
      if (error.code === "E_RTD_ILLEGAL_TRANSITION") {
        reply.code(422).send({ error: error.code, message: "Illegal RTD stage transition." });
        return null;
      }
      if (error.code === "E_RTD_NEGATIVE_TEST_REQUIRED") {
        reply.code(422).send({
          error: error.code,
          message: "Directly-observed return-to-duty test must be linked and negative.",
        });
        return null;
      }
      if (error.code === "E_RTD_CLEARINGHOUSE_REQUIRED") {
        reply.code(422).send({
          error: error.code,
          message: "Clearinghouse update is required before RTD case can complete.",
        });
        return null;
      }
      throw error;
    });

    if (!updated) return;
    return updated;
  });

  app.patch("/api/v1/safety/rtd/cases/:id", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const company = companyQuerySchema.safeParse(req.query ?? {});
    if (!company.success) return reply.code(400).send({ error: "validation_error", details: company.error.flatten() });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const body = patchRtdCaseSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const updated = await withCompanyScope(user.uuid, company.data.operating_company_id, async (client) => {
      const current = await loadRtdCase(client, company.data.operating_company_id, params.data.id);
      if (!current) return null;

      const res = await client.query<RtdCaseRow>(
        `
          UPDATE safety.rtd_case
          SET
            sap_name = COALESCE($3, sap_name),
            sap_eval_date = COALESCE($4::date, sap_eval_date),
            follow_up_plan = COALESCE($5, follow_up_plan),
            follow_up_tests_completed = COALESCE($6, follow_up_tests_completed),
            follow_up_tests_required = COALESCE($7, follow_up_tests_required),
            reprimand_notes = COALESCE($8, reprimand_notes),
            training_records_url = COALESCE($9, training_records_url),
            clearinghouse_updated = COALESCE($10, clearinghouse_updated)
          WHERE operating_company_id = $1
            AND id = $2
            AND voided_at IS NULL
          RETURNING
            id::text,
            operating_company_id::text,
            driver_id::text,
            triggered_by_test_id::text,
            stage::text AS stage,
            sap_name,
            sap_eval_date::text,
            rtd_test_id::text,
            follow_up_plan,
            follow_up_tests_completed,
            follow_up_tests_required,
            opened_at::text,
            closed_at::text,
            reprimand_notes,
            training_records_url,
            clearinghouse_updated
        `,
        [
          company.data.operating_company_id,
          params.data.id,
          body.data.sap_name ?? null,
          body.data.sap_eval_date ?? null,
          body.data.follow_up_plan ?? null,
          body.data.follow_up_tests_completed ?? null,
          body.data.follow_up_tests_required ?? null,
          body.data.reprimand_notes ?? null,
          body.data.training_records_url ?? null,
          body.data.clearinghouse_updated ?? null,
        ]
      );
      return enrichRtdCase(res.rows[0]);
    });

    if (!updated) return reply.code(404).send({ error: "not_found", message: "RTD case not found." });
    return updated;
  });
}
