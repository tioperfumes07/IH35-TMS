import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const listQuerySchema = companyQuerySchema.extend({
  policy_id: z.string().uuid().optional(),
  status: z
    .enum(["scheduled", "reminded", "paid", "overdue", "late_fee_applied"])
    .optional(),
});

const createBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  policy_id: z.string().uuid(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount_cents: z.number().int().nonnegative(),
  status: z.enum(["scheduled", "reminded", "paid", "overdue", "late_fee_applied"]).optional(),
});

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

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

async function withCompanyScope<T>(userId: string, operatingCompanyId: string, fn: (client: Queryable) => Promise<T>) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [operatingCompanyId]);
    return fn(client as Queryable);
  });
}

function selectColumns() {
  return `
    id::text,
    tenant_id::text,
    policy_id::text,
    due_date::text,
    amount_cents::bigint,
    status,
    reminded_at::text,
    paid_at::text,
    late_fee_cents::bigint,
    created_at::text,
    updated_at::text
  `;
}

export async function registerInsurancePaymentScheduleRoutes(app: FastifyInstance) {
  app.get("/api/v1/insurance/payment-schedule", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;

    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });

    const schedules = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const values: unknown[] = [parsed.data.operating_company_id];
      const filters = ["tenant_id = $1::uuid"];
      if (parsed.data.policy_id) {
        values.push(parsed.data.policy_id);
        filters.push(`policy_id = $${values.length}::uuid`);
      }
      if (parsed.data.status) {
        values.push(parsed.data.status);
        filters.push(`status = $${values.length}`);
      }
      const result = await client.query(
        `
          SELECT ${selectColumns()}
          FROM insurance.payment_schedule
          WHERE ${filters.join(" AND ")}
          ORDER BY due_date ASC, created_at ASC
        `,
        values
      );
      return result.rows;
    });

    return { payment_schedules: schedules };
  });

  app.post("/api/v1/insurance/payment-schedule", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });

    const parsed = createBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });

    const created = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const result = await client.query(
        `
          INSERT INTO insurance.payment_schedule (
            tenant_id,
            policy_id,
            due_date,
            amount_cents,
            status
          )
          VALUES ($1::uuid, $2::uuid, $3::date, $4, $5)
          RETURNING ${selectColumns()}
        `,
        [
          parsed.data.operating_company_id,
          parsed.data.policy_id,
          parsed.data.due_date,
          parsed.data.amount_cents,
          parsed.data.status ?? "scheduled",
        ]
      );
      return result.rows[0] ?? null;
    });

    if (!created) return reply.code(404).send({ error: "policy_not_found" });
    return reply.code(201).send(created);
  });

  app.patch("/api/v1/insurance/payment-schedule/:id", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });

    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });

    const updated = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const result = await client.query(
        `
          UPDATE insurance.payment_schedule
          SET status = 'paid',
              paid_at = now(),
              updated_at = now()
          WHERE id = $1::uuid
            AND tenant_id = $2::uuid
            AND status <> 'paid'
          RETURNING ${selectColumns()}
        `,
        [params.data.id, query.data.operating_company_id]
      );
      return result.rows[0] ?? null;
    });

    if (!updated) return reply.code(403).send({ error: "forbidden" });
    return updated;
  });
}
