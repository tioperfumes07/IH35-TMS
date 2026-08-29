/**
 * Drug & Alcohol Program Routes — GAP-81
 * Base path: /api/safety/drug-alcohol
 * Requires: authenticated session + Safety Officer or higher for mutations.
 */
import { setScopedCompanyContext } from "../../_helpers/scoped-company-context.js";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import {
  deactivateEnrollment,
  enrollDriver,
  flagPositive,
  listEnrollments,
  listTestRecords,
  recordResult,
  scheduleTest,
  type TestKind,
  type TestResult,
  type TestType,
} from "./program.service.js";
import { bulkEnrollActiveDrivers, drawRandomPool, listDrawHistory } from "./random-pool.service.js";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const companyQuery = z.object({
  operating_company_id: z.string().uuid(),
  active_only: z.coerce.boolean().optional(),
});

const enrollSchema = z.object({
  operating_company_id: z.string().uuid(),
  driver_uuid: z.string().uuid(),
  consortium_name: z.string().min(1).max(200),
  enrolled_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const bulkEnrollSchema = z.object({
  operating_company_id: z.string().uuid(),
  consortium_name: z.string().min(1).max(200),
});

const scheduleTestSchema = z.object({
  operating_company_id: z.string().uuid(),
  driver_uuid: z.string().uuid(),
  test_type: z.enum(["pre_employment", "random", "post_accident", "reasonable_suspicion", "return_to_duty", "follow_up"]),
  test_kind: z.enum(["drug", "alcohol", "both"]),
  scheduled_at: z.string().datetime().optional(),
});

const recordResultSchema = z.object({
  operating_company_id: z.string().uuid(),
  result: z.enum(["pending", "negative", "positive", "refused", "cancelled"]),
  chain_of_custody_id: z.string().optional(),
  collected_at: z.string().datetime().optional(),
});

const flagPositiveSchema = z.object({
  operating_company_id: z.string().uuid(),
  sap_referral_uuid: z.string().uuid().optional(),
});

const drawSchema = z.object({
  operating_company_id: z.string().uuid(),
  target_drug_pct: z.number().min(1).max(100).optional(),
  target_alcohol_pct: z.number().min(1).max(100).optional(),
});

const uuidParams = z.object({ uuid: z.string().uuid() });

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getAuth(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return reply;
  return req.user;
}

function canMutate(role: string): boolean {
  return ["Owner", "Administrator", "Manager", "Safety"].includes(role);
}

// ─── Register ────────────────────────────────────────────────────────────────

export async function registerDrugAlcoholProgramRoutes(app: FastifyInstance): Promise<void> {
  // ── Enrollments ──────────────────────────────────────────────────────────

  app.get("/api/safety/drug-alcohol/enrollments", async (req, reply) => {
    const user = getAuth(req, reply);
    if (!user) return;
    const parsed = companyQuery.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });

    const enrollments = await withCurrentUser(user.uuid, async (client) => {
      await setScopedCompanyContext(client, user.uuid, parsed.data.operating_company_id);
      return listEnrollments(client, parsed.data.operating_company_id, parsed.data.active_only ?? true);
    });
    return reply.send({ enrollments });
  });

  app.post("/api/safety/drug-alcohol/enrollments", async (req, reply) => {
    const user = getAuth(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const parsed = enrollSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });

    try {
      const enrollment = await withCurrentUser(user.uuid, async (client) => {
        await setScopedCompanyContext(client, user.uuid, parsed.data.operating_company_id);
        const row = await enrollDriver(
          client,
          parsed.data.operating_company_id,
          parsed.data.driver_uuid,
          parsed.data.consortium_name,
          parsed.data.enrolled_at
        );
        await appendCrudAudit(client, user.uuid, "safety.drug_alcohol.enrolled", {
          operating_company_id: parsed.data.operating_company_id,
          resource_type: "safety.da_program_enrollments",
          resource_id: row.uuid,
          driver_uuid: parsed.data.driver_uuid,
          consortium_name: parsed.data.consortium_name,
        });
        return row;
      });
      return reply.code(201).send(enrollment);
    } catch (error) {
      if ((error as Error).message === "active_enrollment_exists") {
        return reply.code(409).send({ error: "active_enrollment_exists" });
      }
      if ((error as Error).message === "active_driver_not_in_operating_company") {
        return reply.code(404).send({ error: "active_driver_not_in_operating_company" });
      }
      throw error;
    }
  });

  // Bulk-enroll every active human driver into the consortium random pool.
  // Root-cause fix for the empty-pool defect: populates safety.da_program_enrollments,
  // which listActiveEnrolledDrivers (the pool query) reads. Idempotent.
  app.post("/api/safety/drug-alcohol/enrollments/bulk-active", async (req, reply) => {
    const user = getAuth(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const parsed = bulkEnrollSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });

    const result = await withCurrentUser(user.uuid, async (client) => {
      await setScopedCompanyContext(client, user.uuid, parsed.data.operating_company_id);
      const bulk = await bulkEnrollActiveDrivers(
        client,
        parsed.data.operating_company_id,
        parsed.data.consortium_name
      );
      await appendCrudAudit(client, user.uuid, "safety.drug_alcohol.bulk_enrolled", {
        operating_company_id: parsed.data.operating_company_id,
        resource_type: "safety.da_program_enrollments",
        resource_id: parsed.data.operating_company_id,
        enrolled_count: bulk.enrolledCount,
        consortium_name: parsed.data.consortium_name,
      });
      return bulk;
    });
    return reply.code(201).send({
      enrolled_count: result.enrolledCount,
      enrolled_driver_uuids: result.enrolledDriverUuids,
    });
  });

  app.delete("/api/safety/drug-alcohol/enrollments/:uuid", async (req, reply) => {
    const user = getAuth(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = uuidParams.safeParse(req.params ?? {});
    const body = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.body ?? {});
    if (!params.success || !body.success) return reply.code(400).send({ error: "validation_error" });

    const ok = await withCurrentUser(user.uuid, async (client) => {
      await setScopedCompanyContext(client, user.uuid, body.data.operating_company_id);
      return deactivateEnrollment(client, body.data.operating_company_id, params.data.uuid);
    });
    if (!ok) return reply.code(404).send({ error: "not_found" });
    return reply.send({ ok: true });
  });

  // ── Tests ─────────────────────────────────────────────────────────────────

  app.get("/api/safety/drug-alcohol/tests", async (req, reply) => {
    const user = getAuth(req, reply);
    if (!user) return;
    const parsed = companyQuery
      .extend({
        driver_uuid: z.string().uuid().optional(),
        result: z.enum(["pending", "negative", "positive", "refused", "cancelled"]).optional(),
      })
      .safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });

    const tests = await withCurrentUser(user.uuid, async (client) => {
      await setScopedCompanyContext(client, user.uuid, parsed.data.operating_company_id);
      return listTestRecords(client, parsed.data.operating_company_id, {
        driverUuid: parsed.data.driver_uuid,
        result: parsed.data.result as TestResult | undefined,
      });
    });
    return reply.send({ tests });
  });

  app.post("/api/safety/drug-alcohol/tests", async (req, reply) => {
    const user = getAuth(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const parsed = scheduleTestSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });

    const test = await withCurrentUser(user.uuid, async (client) => {
      await setScopedCompanyContext(client, user.uuid, parsed.data.operating_company_id);
      const row = await scheduleTest(
        client,
        parsed.data.operating_company_id,
        parsed.data.driver_uuid,
        parsed.data.test_type as TestType,
        parsed.data.test_kind as TestKind,
        parsed.data.scheduled_at
      );
      await appendCrudAudit(client, user.uuid, "safety.drug_alcohol.test_scheduled", {
        operating_company_id: parsed.data.operating_company_id,
        resource_type: "safety.da_test_records",
        resource_id: row.uuid,
        test_type: parsed.data.test_type,
        test_kind: parsed.data.test_kind,
        driver_uuid: parsed.data.driver_uuid,
      });
      return row;
    });
    return reply.code(201).send(test);
  });

  app.patch("/api/safety/drug-alcohol/tests/:uuid/result", async (req, reply) => {
    const user = getAuth(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = uuidParams.safeParse(req.params ?? {});
    const parsed = recordResultSchema.safeParse(req.body ?? {});
    if (!params.success || !parsed.success)
      return reply.code(400).send({ error: "validation_error" });

    const test = await withCurrentUser(user.uuid, async (client) => {
      await setScopedCompanyContext(client, user.uuid, parsed.data.operating_company_id);
      const row = await recordResult(
        client,
        parsed.data.operating_company_id,
        params.data.uuid,
        parsed.data.result as TestResult,
        parsed.data.chain_of_custody_id,
        parsed.data.collected_at
      );
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.drug_alcohol.result_recorded",
        {
          operating_company_id: parsed.data.operating_company_id,
          resource_type: "safety.da_test_records",
          resource_id: row.uuid,
          result: parsed.data.result,
        },
        parsed.data.result === "positive" ? "warning" : "info"
      );
      return row;
    });
    return reply.send(test);
  });

  app.post("/api/safety/drug-alcohol/tests/:uuid/flag-positive", async (req, reply) => {
    const user = getAuth(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = uuidParams.safeParse(req.params ?? {});
    const parsed = flagPositiveSchema.safeParse(req.body ?? {});
    if (!params.success || !parsed.success) return reply.code(400).send({ error: "validation_error" });

    const test = await withCurrentUser(user.uuid, async (client) => {
      await setScopedCompanyContext(client, user.uuid, parsed.data.operating_company_id);
      const row = await flagPositive(
        client,
        parsed.data.operating_company_id,
        params.data.uuid,
        parsed.data.sap_referral_uuid
      );
      await appendCrudAudit(client, user.uuid, "safety.drug_alcohol.positive_flagged", {
        operating_company_id: parsed.data.operating_company_id,
        resource_type: "safety.da_test_records",
        resource_id: row.uuid,
        sap_referral_uuid: parsed.data.sap_referral_uuid ?? null,
      }, "warning");
      return row;
    });
    return reply.send(test);
  });

  // ── Random pool ───────────────────────────────────────────────────────────

  app.get("/api/safety/drug-alcohol/random-pool/draws", async (req, reply) => {
    const user = getAuth(req, reply);
    if (!user) return;
    const parsed = companyQuery.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });

    const draws = await withCurrentUser(user.uuid, async (client) => {
      await setScopedCompanyContext(client, user.uuid, parsed.data.operating_company_id);
      return listDrawHistory(client, parsed.data.operating_company_id);
    });
    return reply.send({ draws });
  });

  app.post("/api/safety/drug-alcohol/random-pool/draw", async (req, reply) => {
    const user = getAuth(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const parsed = drawSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });

    const result = await withCurrentUser(user.uuid, async (client) => {
      await setScopedCompanyContext(client, user.uuid, parsed.data.operating_company_id);
      const draw = await drawRandomPool(client, parsed.data.operating_company_id, {
        targetDrugPct: parsed.data.target_drug_pct,
        targetAlcoholPct: parsed.data.target_alcohol_pct,
      });
      await appendCrudAudit(client, user.uuid, "safety.drug_alcohol.random_draw", {
        operating_company_id: parsed.data.operating_company_id,
        resource_type: "safety.da_random_pool_draws",
        resource_id: draw.uuid,
        pool_size: draw.pool_size,
        drug_drawn_count: draw.drug_drawn_count,
        alcohol_drawn_count: draw.alcohol_drawn_count,
        test_records_created: draw.test_records_created,
      });
      return draw;
    });
    return reply.code(201).send(result);
  });
}
