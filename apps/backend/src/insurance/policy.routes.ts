import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import {
  INSURANCE_COVERAGE_TYPES,
  INSURANCE_POLICY_STATUSES,
} from "./policy.shared.js";
import { createPolicyBillSchedule } from "./policy-bill-schedule.service.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const listPoliciesQuerySchema = companyQuerySchema.extend({
  coverage_type: z.enum(INSURANCE_COVERAGE_TYPES).optional(),
  status: z.enum(INSURANCE_POLICY_STATUSES).optional(),
});

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

const policyIdParamsSchema = z.object({
  policy_id: z.string().uuid(),
});

const assetIdParamsSchema = z.object({
  id: z.string().uuid(),
});

const createPolicySchema = z.object({
  operating_company_id: z.string().uuid(),
  insurer_name: z.string().trim().min(1).max(250),
  policy_number: z.string().trim().min(1).max(120),
  coverage_type: z.enum(INSURANCE_COVERAGE_TYPES),
  effective_date: z.string(),
  expiry_date: z.string(),
  total_premium_cents: z.number().int().nonnegative().default(0),
  down_payment_cents: z.number().int().nonnegative().default(0),
  installment_count: z.number().int().nonnegative().default(0),
  due_day: z.number().int().min(1).max(31).nullable().optional(),
  pay_day: z.number().int().min(1).max(31).nullable().optional(),
  late_fee_pct: z.number().min(0).max(999.99).default(0),
  insurer_email: z.string().trim().email().nullable().optional(),
  agent_contact: z.string().trim().max(500).nullable().optional(),
  status: z.enum(INSURANCE_POLICY_STATUSES).default("pending"),
  /** Accounting vendor ID for the insurer. When provided with installment_count > 0,
   *  bill schedule rows are created in accounting.bills via createBill(). */
  vendor_id: z.string().trim().min(1).nullable().optional(),
});

const updatePolicySchema = z
  .object({
    insurer_name: z.string().trim().min(1).max(250).optional(),
    policy_number: z.string().trim().min(1).max(120).optional(),
    coverage_type: z.enum(INSURANCE_COVERAGE_TYPES).optional(),
    effective_date: z.string().optional(),
    expiry_date: z.string().optional(),
    total_premium_cents: z.number().int().nonnegative().optional(),
    down_payment_cents: z.number().int().nonnegative().optional(),
    installment_count: z.number().int().nonnegative().optional(),
    due_day: z.number().int().min(1).max(31).nullable().optional(),
    pay_day: z.number().int().min(1).max(31).nullable().optional(),
    late_fee_pct: z.number().min(0).max(999.99).optional(),
    insurer_email: z.string().trim().email().nullable().optional(),
    agent_contact: z.string().trim().max(500).nullable().optional(),
    status: z.enum(INSURANCE_POLICY_STATUSES).optional(),
    vendor_id: z.string().trim().min(1).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "at least one field is required" });

const createPolicyUnitSchema = z.object({
  operating_company_id: z.string().uuid(),
  asset_id: z.string().uuid(),
  insured_value_cents: z.number().int().nonnegative().default(0),
});

const updatePolicyUnitSchema = z
  .object({
    insured_value_cents: z.number().int().nonnegative().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "at least one field is required" });

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function canMutate(role: string) {
  return ["Owner", "Administrator", "Manager", "Accountant"].includes(role);
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: Queryable) => Promise<T>
) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${operatingCompanyId}'`);
    return fn(client as Queryable);
  });
}

function policySelectColumns() {
  return `
    id::text,
    insurer_name,
    policy_number,
    coverage_type,
    coverage_type_id::text,
    effective_date::text,
    expiry_date::text,
    total_premium_cents::bigint,
    down_payment_cents::bigint,
    installment_count::int,
    due_day::int,
    pay_day::int,
    late_fee_pct::text,
    insurer_email,
    agent_contact,
    status,
    vendor_id,
    created_at::text,
    updated_at::text
  `;
}

function policyUnitSelectColumns() {
  return `
    id::text,
    policy_id::text,
    asset_id::text,
    insured_value_cents::bigint,
    created_at::text,
    updated_at::text
  `;
}

export async function registerInsurancePolicyRoutes(app: FastifyInstance) {
  app.get("/api/v1/insurance/policies", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const parsed = listPoliciesQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });

    const rows = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const values: unknown[] = [parsed.data.operating_company_id];
      const filters = ["tenant_id = $1::uuid"];
      if (parsed.data.coverage_type) {
        values.push(parsed.data.coverage_type);
        filters.push(`coverage_type = $${values.length}`);
      }
      if (parsed.data.status) {
        values.push(parsed.data.status);
        filters.push(`status = $${values.length}`);
      }
      const result = await client.query(
        `
          SELECT ${policySelectColumns()}
          FROM insurance.policy
          WHERE ${filters.join(" AND ")}
          ORDER BY expiry_date ASC, insurer_name ASC
        `,
        values
      );
      return result.rows;
    });

    return { policies: rows };
  });

  app.get("/api/v1/insurance/policies/:id", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });

    const policy = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const policyRes = await client.query(
        `
          SELECT ${policySelectColumns()}
          FROM insurance.policy
          WHERE tenant_id = $1::uuid AND id = $2::uuid
        `,
        [query.data.operating_company_id, params.data.id]
      );
      if (!policyRes.rows[0]) return null;
      const unitsRes = await client.query(
        `
          SELECT ${policyUnitSelectColumns()}
          FROM insurance.policy_unit
          WHERE tenant_id = $1::uuid AND policy_id = $2::uuid
          ORDER BY created_at ASC
        `,
        [query.data.operating_company_id, params.data.id]
      );
      return { ...policyRes.rows[0], units: unitsRes.rows };
    });

    if (!policy) return reply.code(404).send({ error: "policy_not_found" });
    return policy;
  });

  app.post("/api/v1/insurance/policies", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const parsed = createPolicySchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const body = parsed.data;

    // Forward-fix (GAP-86): the bill schedule is generated INSIDE the same transaction
    // as the policy insert. Any failure throws and rolls the policy back (atomic /
    // all-or-nothing) — no more silent non-fatal warning header / zero-bill policies.
    // Combined with the Idempotency-Key now required on this route (REQUIRED_MATCHERS)
    // and the replay-skip in createPolicyBillSchedule(), retries cannot double-bill.
    let created: Record<string, unknown> | null;
    try {
      created = await withCompanyScope(user.uuid, body.operating_company_id, async (client) => {
        const coverageTypeRes = await client.query<{ id: string }>(
          `
            SELECT id::text
            FROM insurance.type_catalog
            WHERE tenant_id = $1::uuid
              AND code = $2
              AND active = true
            LIMIT 1
          `,
          [body.operating_company_id, body.coverage_type]
        );
        if (!coverageTypeRes.rows[0]) return null;

        const result = await client.query(
          `
            INSERT INTO insurance.policy (
              tenant_id,
              insurer_name,
              policy_number,
              coverage_type,
              coverage_type_id,
              effective_date,
              expiry_date,
              total_premium_cents,
              down_payment_cents,
              installment_count,
              due_day,
              pay_day,
              late_fee_pct,
              insurer_email,
              agent_contact,
              status,
              vendor_id
            )
            VALUES (
              $1::uuid, $2, $3, $4, $5::uuid, $6::date, $7::date, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
            )
            RETURNING ${policySelectColumns()}, vendor_id
          `,
          [
            body.operating_company_id,
            body.insurer_name,
            body.policy_number,
            body.coverage_type,
            coverageTypeRes.rows[0].id,
            body.effective_date,
            body.expiry_date,
            body.total_premium_cents,
            body.down_payment_cents,
            body.installment_count,
            body.due_day ?? null,
            body.pay_day ?? null,
            body.late_fee_pct,
            body.insurer_email ?? null,
            body.agent_contact ?? null,
            body.status,
            body.vendor_id ?? null,
          ]
        );
        const policyRow = result.rows[0] as Record<string, unknown> | undefined;
        await appendCrudAudit(client, user.uuid, "insurance.policy.created", {
          resource_id: policyRow?.id,
          operating_company_id: body.operating_company_id,
        });

        if (body.vendor_id && body.installment_count > 0 && policyRow?.id) {
          await createPolicyBillSchedule(
            String(policyRow.id),
            user.uuid,
            client as Parameters<typeof createPolicyBillSchedule>[2]
          );
        }
        return policyRow ?? null;
      });
    } catch (err) {
      // Hard-fail: the policy transaction has rolled back and createPolicyBillSchedule
      // has already voided / CRITICAL-alerted any bills it committed. Surface an error.
      app.log.error({ err }, "[insurance] policy create + bill schedule failed; policy rolled back");
      return reply
        .code(502)
        .send({ error: "bill_schedule_failed", detail: "policy was not created; no partial bills remain" });
    }

    if (!created) return reply.code(400).send({ error: "coverage_type_not_found" });

    return reply.code(201).send(created);
  });

  app.patch("/api/v1/insurance/policies/:id", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const bodyParsed = updatePolicySchema.safeParse(req.body ?? {});
    if (!bodyParsed.success) return reply.code(400).send({ error: "validation_error", details: bodyParsed.error.flatten() });
    const body = bodyParsed.data;

    const updated = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      let coverageTypeId: string | null = null;
      if (body.coverage_type !== undefined) {
        const coverageTypeRes = await client.query<{ id: string }>(
          `
            SELECT id::text
            FROM insurance.type_catalog
            WHERE tenant_id = $1::uuid
              AND code = $2
              AND active = true
            LIMIT 1
          `,
          [query.data.operating_company_id, body.coverage_type]
        );
        if (!coverageTypeRes.rows[0]) return { kind: "coverage_type_not_found" as const };
        coverageTypeId = coverageTypeRes.rows[0].id;
      }

      const assignments: string[] = [];
      const values: unknown[] = [query.data.operating_company_id, params.data.id];
      const setField = (column: string, value: unknown, cast = "") => {
        values.push(value);
        assignments.push(`${column} = $${values.length}${cast}`);
      };
      if (body.insurer_name !== undefined) setField("insurer_name", body.insurer_name);
      if (body.policy_number !== undefined) setField("policy_number", body.policy_number);
      if (body.coverage_type !== undefined) {
        setField("coverage_type", body.coverage_type);
        setField("coverage_type_id", coverageTypeId, "::uuid");
      }
      if (body.effective_date !== undefined) setField("effective_date", body.effective_date, "::date");
      if (body.expiry_date !== undefined) setField("expiry_date", body.expiry_date, "::date");
      if (body.total_premium_cents !== undefined) setField("total_premium_cents", body.total_premium_cents);
      if (body.down_payment_cents !== undefined) setField("down_payment_cents", body.down_payment_cents);
      if (body.installment_count !== undefined) setField("installment_count", body.installment_count);
      if (body.due_day !== undefined) setField("due_day", body.due_day);
      if (body.pay_day !== undefined) setField("pay_day", body.pay_day);
      if (body.late_fee_pct !== undefined) setField("late_fee_pct", body.late_fee_pct);
      if (body.insurer_email !== undefined) setField("insurer_email", body.insurer_email);
      if (body.agent_contact !== undefined) setField("agent_contact", body.agent_contact);
      if (body.status !== undefined) setField("status", body.status);
      if (body.vendor_id !== undefined) setField("vendor_id", body.vendor_id);

      const result = await client.query(
        `
          UPDATE insurance.policy
          SET ${assignments.join(", ")}
          WHERE tenant_id = $1::uuid AND id = $2::uuid
          RETURNING ${policySelectColumns()}
        `,
        values
      );
      if (!result.rows[0]) return { kind: "policy_not_found" as const };
      await appendCrudAudit(client, user.uuid, "insurance.policy.updated", {
        resource_id: params.data.id,
        operating_company_id: query.data.operating_company_id,
      });
      return { kind: "ok" as const, row: result.rows[0] };
    });

    if (updated.kind === "coverage_type_not_found") return reply.code(400).send({ error: "coverage_type_not_found" });
    if (updated.kind === "policy_not_found") return reply.code(404).send({ error: "policy_not_found" });
    return updated.row;
  });

  app.delete("/api/v1/insurance/policies/:id", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });

    const deleted = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const result = await client.query(
        `
          DELETE FROM insurance.policy
          WHERE tenant_id = $1::uuid AND id = $2::uuid
          RETURNING id::text
        `,
        [query.data.operating_company_id, params.data.id]
      );
      if (!result.rows[0]) return false;
      await appendCrudAudit(client, user.uuid, "insurance.policy.deleted", {
        resource_id: params.data.id,
        operating_company_id: query.data.operating_company_id,
      });
      return true;
    });

    if (!deleted) return reply.code(404).send({ error: "policy_not_found" });
    return reply.code(204).send();
  });

  app.post("/api/v1/insurance/policies/:policy_id/units", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = policyIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const parsed = createPolicyUnitSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const body = parsed.data;

    const created = await withCompanyScope(user.uuid, body.operating_company_id, async (client) => {
      const policyRes = await client.query(
        `
          SELECT id::text
          FROM insurance.policy
          WHERE tenant_id = $1::uuid AND id = $2::uuid
        `,
        [body.operating_company_id, params.data.policy_id]
      );
      if (!policyRes.rows[0]) return { kind: "policy_not_found" as const };

      const assetRes = await client.query(
        `
          SELECT id::text
          FROM mdata.assets
          WHERE tenant_id = $1::uuid AND id = $2::uuid
        `,
        [body.operating_company_id, body.asset_id]
      );
      if (!assetRes.rows[0]) return { kind: "asset_not_found" as const };

      const result = await client.query(
        `
          INSERT INTO insurance.policy_unit (
            tenant_id, policy_id, asset_id, insured_value_cents
          )
          VALUES ($1::uuid, $2::uuid, $3::uuid, $4)
          RETURNING ${policyUnitSelectColumns()}
        `,
        [body.operating_company_id, params.data.policy_id, body.asset_id, body.insured_value_cents]
      );
      await appendCrudAudit(client, user.uuid, "insurance.policy_unit.created", {
        resource_id: result.rows[0]?.id,
        operating_company_id: body.operating_company_id,
        policy_id: params.data.policy_id,
        asset_id: body.asset_id,
      });
      return { kind: "ok" as const, row: result.rows[0] };
    });

    if (created.kind === "policy_not_found") return reply.code(404).send({ error: "policy_not_found" });
    if (created.kind === "asset_not_found") return reply.code(404).send({ error: "asset_not_found" });
    return reply.code(201).send(created.row);
  });

  app.patch("/api/v1/insurance/policy-units/:id", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const bodyParsed = updatePolicyUnitSchema.safeParse(req.body ?? {});
    if (!bodyParsed.success) return reply.code(400).send({ error: "validation_error", details: bodyParsed.error.flatten() });

    const updated = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const result = await client.query(
        `
          UPDATE insurance.policy_unit
          SET insured_value_cents = $3
          WHERE tenant_id = $1::uuid AND id = $2::uuid
          RETURNING ${policyUnitSelectColumns()}
        `,
        [query.data.operating_company_id, params.data.id, bodyParsed.data.insured_value_cents]
      );
      if (!result.rows[0]) return null;
      await appendCrudAudit(client, user.uuid, "insurance.policy_unit.updated", {
        resource_id: params.data.id,
        operating_company_id: query.data.operating_company_id,
      });
      return result.rows[0];
    });

    if (!updated) return reply.code(404).send({ error: "policy_unit_not_found" });
    return updated;
  });

  app.delete("/api/v1/insurance/policy-units/:id", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });

    const deleted = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const result = await client.query(
        `
          DELETE FROM insurance.policy_unit
          WHERE tenant_id = $1::uuid AND id = $2::uuid
          RETURNING id::text
        `,
        [query.data.operating_company_id, params.data.id]
      );
      if (!result.rows[0]) return false;
      await appendCrudAudit(client, user.uuid, "insurance.policy_unit.deleted", {
        resource_id: params.data.id,
        operating_company_id: query.data.operating_company_id,
      });
      return true;
    });

    if (!deleted) return reply.code(404).send({ error: "policy_unit_not_found" });
    return reply.code(204).send();
  });

  app.get("/api/v1/assets/:id/coverage", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const params = assetIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });

    const coverage = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const assetRes = await client.query(
        `
          SELECT id::text, unit_code, asset_type, status
          FROM mdata.assets
          WHERE tenant_id = $1::uuid AND id = $2::uuid
        `,
        [query.data.operating_company_id, params.data.id]
      );
      if (!assetRes.rows[0]) return null;

      const coveragesRes = await client.query(
        `
          SELECT
            p.id::text AS policy_id,
            p.insurer_name,
            p.policy_number,
            p.coverage_type,
            p.effective_date::text,
            p.expiry_date::text,
            p.status,
            pu.insured_value_cents::bigint
          FROM insurance.policy_unit pu
          JOIN insurance.policy p ON p.id = pu.policy_id AND p.tenant_id = pu.tenant_id
          WHERE pu.tenant_id = $1::uuid
            AND pu.asset_id = $2::uuid
          ORDER BY p.coverage_type ASC, p.expiry_date ASC
        `,
        [query.data.operating_company_id, params.data.id]
      );

      const coveredTypes = new Set(
        coveragesRes.rows.map((row) => String((row as { coverage_type?: string }).coverage_type ?? ""))
      );
      const gaps = INSURANCE_COVERAGE_TYPES.filter((coverageType) => !coveredTypes.has(coverageType));

      return {
        asset: assetRes.rows[0],
        coverages: coveragesRes.rows,
        covered_types: [...coveredTypes],
        gap_types: gaps,
      };
    });

    if (!coverage) return reply.code(404).send({ error: "asset_not_found" });
    return coverage;
  });
}
