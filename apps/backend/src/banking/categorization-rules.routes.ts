import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { autoCategorize } from "../integrations/plaid/plaid.service.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const ruleIdParamsSchema = z.object({
  id: z.string().uuid(),
});

const createBodySchema = z.object({
  plaid_category_pattern: z.string().trim().min(1).max(120),
  coa_account_id: z.string().uuid().nullable().optional(),
  priority: z.coerce.number().int().min(1).max(9999).default(100),
});

const patchBodySchema = z
  .object({
    plaid_category_pattern: z.string().trim().min(1).max(120).optional(),
    coa_account_id: z.string().uuid().nullable().optional(),
    priority: z.coerce.number().int().min(1).max(9999).optional(),
    is_active: z.boolean().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, { message: "at_least_one_field_required" });

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user as { uuid: string; role: string };
}

function canManage(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Accountant";
}

function canDeactivate(role: string) {
  return role === "Owner" || role === "Administrator";
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }> }) => Promise<T>
) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, false)`, [operatingCompanyId]);
    return fn(client);
  });
}

export async function registerCategorizationRulesRoutes(app: FastifyInstance) {
  app.get("/api/v1/banking/categorization-rules", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canManage(user.role)) return reply.code(403).send({ error: "forbidden" });
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const rules = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT id, operating_company_id, plaid_category_pattern, coa_account_id, priority, is_active, created_at, updated_at
          FROM banking.transaction_categories
          WHERE operating_company_id = $1
            AND is_active = true
          ORDER BY priority ASC, created_at ASC
        `,
        [query.data.operating_company_id]
      );
      return res.rows;
    });
    return { rules };
  });

  app.get("/api/v1/banking/categorization-rules/stats", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canManage(user.role)) return reply.code(403).send({ error: "forbidden" });
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const stats = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const rulesRes = await client.query<{ count: number }>(
        `
          SELECT COUNT(*)::int AS count
          FROM banking.transaction_categories
          WHERE operating_company_id = $1
            AND is_active = true
        `,
        [query.data.operating_company_id]
      );
      const txRes = await client.query<{ matched: number; unmatched: number }>(
        `
          SELECT
            COUNT(*) FILTER (WHERE coa_account_id IS NOT NULL)::int AS matched,
            COUNT(*) FILTER (WHERE coa_account_id IS NULL)::int AS unmatched
          FROM banking.bank_transactions
          WHERE operating_company_id = $1
            AND created_at >= (now() - interval '7 day')
            AND array_length(plaid_category, 1) IS NOT NULL
        `,
        [query.data.operating_company_id]
      );
      return {
        active_rules: Number(rulesRes.rows[0]?.count ?? 0),
        matched_7d: Number(txRes.rows[0]?.matched ?? 0),
        unmatched_7d: Number(txRes.rows[0]?.unmatched ?? 0),
      };
    });
    return stats;
  });

  app.get("/api/v1/banking/categorization-rules/preview", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canManage(user.role)) return reply.code(403).send({ error: "forbidden" });
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const transactions = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT
            bt.id,
            bt.transaction_date,
            bt.description,
            bt.plaid_category,
            bt.coa_account_id,
            a.account_number,
            a.account_name
          FROM banking.bank_transactions bt
          LEFT JOIN catalogs.accounts a ON a.id = bt.coa_account_id
          WHERE bt.operating_company_id = $1
          ORDER BY bt.created_at DESC
          LIMIT 50
        `,
        [query.data.operating_company_id]
      );
      return res.rows;
    });
    return { transactions };
  });

  app.post("/api/v1/banking/categorization-rules", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canManage(user.role)) return reply.code(403).send({ error: "forbidden" });
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const body = createBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const created = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query<{ id: string }>(
        `
          INSERT INTO banking.transaction_categories (
            operating_company_id, plaid_category_pattern, coa_account_id, priority, is_active, created_at, updated_at
          )
          VALUES ($1,$2,$3,$4,true,now(),now())
          RETURNING id
        `,
        [query.data.operating_company_id, body.data.plaid_category_pattern, body.data.coa_account_id ?? null, body.data.priority]
      );
      if ((res.rowCount ?? 0) === 0 || !res.rows[0]?.id) {
        throw new Error("categorization_rule_insert_failed");
      }
      await appendCrudAudit(
        client,
        user.uuid,
        "banking.categorization_rule.created",
        {
          resource_type: "banking.transaction_categories",
          resource_id: res.rows[0].id,
          operating_company_id: query.data.operating_company_id,
          plaid_category_pattern: body.data.plaid_category_pattern,
          coa_account_id: body.data.coa_account_id ?? null,
          priority: body.data.priority,
        },
        "info",
        "P5-T4-AUTOCAT"
      );
      return res.rows[0].id;
    });
    return reply.code(201).send({ id: created });
  });

  app.patch("/api/v1/banking/categorization-rules/:id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canManage(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = ruleIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const body = patchBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const updated = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const updates: string[] = [];
      const values: unknown[] = [params.data.id, query.data.operating_company_id];
      if (body.data.plaid_category_pattern !== undefined) {
        values.push(body.data.plaid_category_pattern);
        updates.push(`plaid_category_pattern = $${values.length}`);
      }
      if (body.data.coa_account_id !== undefined) {
        values.push(body.data.coa_account_id);
        updates.push(`coa_account_id = $${values.length}`);
      }
      if (body.data.priority !== undefined) {
        values.push(body.data.priority);
        updates.push(`priority = $${values.length}`);
      }
      if (body.data.is_active !== undefined) {
        values.push(body.data.is_active);
        updates.push(`is_active = $${values.length}`);
      }
      updates.push("updated_at = now()");
      const res = await client.query<{ id: string }>(
        `
          UPDATE banking.transaction_categories
          SET ${updates.join(", ")}
          WHERE id = $1
            AND operating_company_id = $2
          RETURNING id
        `,
        values
      );
      if (!res.rows[0]) return null;
      await appendCrudAudit(
        client,
        user.uuid,
        "banking.categorization_rule.updated",
        {
          resource_type: "banking.transaction_categories",
          resource_id: res.rows[0].id,
          operating_company_id: query.data.operating_company_id,
          updates: body.data,
        },
        "info",
        "P5-T4-AUTOCAT"
      );
      return res.rows[0].id;
    });
    if (!updated) return reply.code(404).send({ error: "categorization_rule_not_found" });
    return { ok: true, id: updated };
  });

  app.delete("/api/v1/banking/categorization-rules/:id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canDeactivate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = ruleIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const deactivated = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query<{ id: string }>(
        `
          UPDATE banking.transaction_categories
          SET is_active = false, updated_at = now()
          WHERE id = $1
            AND operating_company_id = $2
          RETURNING id
        `,
        [params.data.id, query.data.operating_company_id]
      );
      if (!res.rows[0]) return null;
      await appendCrudAudit(
        client,
        user.uuid,
        "banking.categorization_rule.deactivated",
        {
          resource_type: "banking.transaction_categories",
          resource_id: res.rows[0].id,
          operating_company_id: query.data.operating_company_id,
        },
        "warning",
        "P5-T4-AUTOCAT"
      );
      return res.rows[0].id;
    });
    if (!deactivated) return reply.code(404).send({ error: "categorization_rule_not_found" });
    return { ok: true, id: deactivated };
  });

  app.post("/api/v1/banking/categorization-rules/:id/apply-historical", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canDeactivate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = ruleIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    let matched = 0;
    try {
      const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
        const ruleRes = await client.query<{ id: string }>(
          `
            SELECT id
            FROM banking.transaction_categories
            WHERE id = $1
              AND operating_company_id = $2
            LIMIT 1
          `,
          [params.data.id, query.data.operating_company_id]
        );
        if (!ruleRes.rows[0]) throw new Error("categorization_rule_not_found");

        const txRes = await client.query<{ id: string; operating_company_id: string; plaid_category: string[] }>(
          `
            SELECT id, operating_company_id, plaid_category
            FROM banking.bank_transactions
            WHERE operating_company_id = $1
              AND coa_account_id IS NULL
            ORDER BY created_at DESC
          `,
          [query.data.operating_company_id]
        );

        let localMatched = 0;
        for (const tx of txRes.rows) {
          const rule = await autoCategorize({
            id: tx.id,
            operating_company_id: tx.operating_company_id,
            plaid_category: tx.plaid_category ?? [],
          });
          if (rule) localMatched += 1;
        }

        await appendCrudAudit(
          client,
          user.uuid,
          "banking.categorization_rule.apply_historical",
          {
            resource_type: "banking.transaction_categories",
            resource_id: params.data.id,
            operating_company_id: query.data.operating_company_id,
            matched: localMatched,
          },
          "info",
          "P5-T4-AUTOCAT"
        );
        return { matched: localMatched };
      });
      matched = result.matched;
    } catch (error) {
      if ((error as Error).message === "categorization_rule_not_found") {
        return reply.code(404).send({ error: "categorization_rule_not_found" });
      }
      throw error;
    }
    return { matched };
  });
}

