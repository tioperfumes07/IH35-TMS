import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit, buildPatchChanges } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { isCatalogWriteRole } from "../auth/role-helpers.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const listQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(["active", "inactive"]).optional(),
  search: z.string().trim().min(1).max(100).optional(),
});

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const idParamSchema = z.object({ id: z.string().uuid() });

const createBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  template_name: z.string().trim().min(1).max(200),
  template_code: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2000).optional(),
  debit_account_id: z.string().uuid(),
  credit_account_id: z.string().uuid(),
  default_class_id: z.string().uuid().optional(),
  default_memo: z.string().trim().max(1000).optional(),
  is_active: z.boolean().default(true),
});

const updateBodySchema = z
  .object({
    template_name: z.string().trim().min(1).max(200).optional(),
    template_code: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    debit_account_id: z.string().uuid().optional(),
    credit_account_id: z.string().uuid().optional(),
    default_class_id: z.string().uuid().nullable().optional(),
    default_memo: z.string().trim().max(1000).nullable().optional(),
    is_active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "at least one field is required" });

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return reply;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function mapConflict(constraint?: string): string {
  if (!constraint) return "catalog_posting_template_conflict";
  if (constraint.includes("template_name")) return "catalog_posting_template_conflict_template_name";
  if (constraint.includes("template_code")) return "catalog_posting_template_conflict_template_code";
  return "catalog_posting_template_conflict";
}

/** LST-F03: FORCE RLS company_scope requires entity GUC on every CRUD path. */
async function withEntityScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: {
    query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
  }) => Promise<T>
): Promise<T> {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [operatingCompanyId]);
    return fn(client);
  });
}

const SELECT_COLS = `
  id, operating_company_id, template_name, template_code, description, debit_account_id, credit_account_id,
  default_class_id, default_memo, is_active,
  created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
`;

async function assertSameEntityAccounts(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
  opco: string,
  debitId: string,
  creditId: string,
  classId?: string | null
): Promise<"ok" | "invalid_account_or_class_reference"> {
  const acct = await client.query(
    `SELECT id FROM catalogs.accounts
      WHERE operating_company_id = $1::uuid
        AND deactivated_at IS NULL
        AND id = ANY($2::uuid[])`,
    [opco, [debitId, creditId]]
  );
  const ids = new Set(acct.rows.map((r) => String(r.id)));
  if (!ids.has(debitId) || !ids.has(creditId)) return "invalid_account_or_class_reference";
  if (classId) {
    const cls = await client.query(
      `SELECT id FROM catalogs.classes
        WHERE id = $1 AND operating_company_id = $2::uuid AND deactivated_at IS NULL
        LIMIT 1`,
      [classId, opco]
    );
    if (!cls.rows[0]) return "invalid_account_or_class_reference";
  }
  return "ok";
}

export async function registerPostingTemplateRoutes(app: FastifyInstance) {
  app.get("/api/v1/catalogs/posting-templates", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      if (!(req.query as { operating_company_id?: string } | undefined)?.operating_company_id) {
        return reply.code(400).send({ error: "operating_company_id_required" });
      }
      return sendValidationError(reply, parsed.error);
    }
    const { operating_company_id: opco, limit, offset, status, search } = parsed.data;

    const posting_templates = await withEntityScope(authUser.uuid, opco, async (client) => {
      const values: unknown[] = [opco];
      const filters: string[] = ["operating_company_id = $1::uuid"];
      if (status === "active") filters.push("is_active = true");
      if (status === "inactive") filters.push("is_active = false");
      if (search) {
        values.push(`%${search}%`);
        const idx = values.length;
        filters.push(`(template_name ILIKE $${idx} OR template_code ILIKE $${idx})`);
      }
      values.push(limit);
      values.push(offset);
      const res = await client.query(
        `
          SELECT ${SELECT_COLS}
          FROM catalogs.posting_templates
          WHERE ${filters.join(" AND ")}
          ORDER BY created_at DESC
          LIMIT $${values.length - 1}
          OFFSET $${values.length}
        `,
        values
      );
      return res.rows;
    });

    return { posting_templates };
  });

  app.post("/api/v1/catalogs/posting-templates", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsed = createBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    const b = parsed.data;

    if (b.debit_account_id === b.credit_account_id) {
      return reply.code(400).send({ error: "debit_credit_must_differ" });
    }

    try {
      const created = await withEntityScope(authUser.uuid, b.operating_company_id, async (client) => {
        const ok = await assertSameEntityAccounts(
          client,
          b.operating_company_id,
          b.debit_account_id,
          b.credit_account_id,
          b.default_class_id ?? null
        );
        if (ok !== "ok") {
          const err = new Error(ok);
          (err as { code?: string }).code = "23503";
          throw err;
        }

        const res = await client.query(
          `
            INSERT INTO catalogs.posting_templates (
              operating_company_id, template_name, template_code, description, debit_account_id, credit_account_id,
              default_class_id, default_memo, is_active, created_by_user_id, updated_by_user_id
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10
            )
            RETURNING ${SELECT_COLS}
          `,
          [
            b.operating_company_id,
            b.template_name,
            b.template_code,
            b.description ?? null,
            b.debit_account_id,
            b.credit_account_id,
            b.default_class_id ?? null,
            b.default_memo ?? null,
            b.is_active,
            authUser.uuid,
          ]
        );
        const row = res.rows[0];
        await appendCrudAudit(client, authUser.uuid, "catalogs.posting_templates.created", {
          resource_id: row.id,
          resource_type: "catalogs.posting_templates",
          id: row.id,
          operating_company_id: row.operating_company_id,
          template_name: row.template_name,
          template_code: row.template_code,
          is_active: row.is_active,
        });
        return row;
      });
      return reply.code(201).send(created);
    } catch (err) {
      const code = (err as { code?: string }).code;
      const constraint = (err as { constraint?: string }).constraint;
      if (code === "23505") return reply.code(409).send({ error: mapConflict(constraint), field: constraint ?? null });
      if (code === "23503") return reply.code(400).send({ error: "invalid_account_or_class_reference" });
      throw err;
    }
  });

  app.get("/api/v1/catalogs/posting-templates/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return reply.code(400).send({ error: "operating_company_id_required" });

    const row = await withEntityScope(authUser.uuid, parsedQuery.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT ${SELECT_COLS}
          FROM catalogs.posting_templates
          WHERE id = $1 AND operating_company_id = $2::uuid
          LIMIT 1
        `,
        [parsedParams.data.id, parsedQuery.data.operating_company_id]
      );
      return res.rows[0] ?? null;
    });
    if (!row) return reply.code(404).send({ error: "catalog_posting_template_not_found" });
    return row;
  });

  app.patch("/api/v1/catalogs/posting-templates/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return reply.code(400).send({ error: "operating_company_id_required" });
    const parsedBody = updateBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;
    const opco = parsedQuery.data.operating_company_id;

    const setParts: string[] = [];
    const values: unknown[] = [];
    const add = (col: string, val: unknown) => {
      values.push(val);
      setParts.push(`${col} = $${values.length}`);
    };
    if ("template_name" in b) add("template_name", b.template_name ?? null);
    if ("template_code" in b) add("template_code", b.template_code ?? null);
    if ("description" in b) add("description", b.description ?? null);
    if ("debit_account_id" in b) add("debit_account_id", b.debit_account_id ?? null);
    if ("credit_account_id" in b) add("credit_account_id", b.credit_account_id ?? null);
    if ("default_class_id" in b) add("default_class_id", b.default_class_id ?? null);
    if ("default_memo" in b) add("default_memo", b.default_memo ?? null);
    if ("is_active" in b) add("is_active", b.is_active);
    add("updated_by_user_id", authUser.uuid);
    values.push(parsedParams.data.id);
    const idIdx = values.length;
    values.push(opco);
    const opcoIdx = values.length;

    try {
      const updated = await withEntityScope(authUser.uuid, opco, async (client) => {
        const oldRes = await client.query(
          `
            SELECT ${SELECT_COLS}
            FROM catalogs.posting_templates
            WHERE id = $1 AND operating_company_id = $2::uuid
            LIMIT 1
          `,
          [parsedParams.data.id, opco]
        );
        const oldRow = oldRes.rows[0] ?? null;
        if (!oldRow) return null;
        const finalDebit = b.debit_account_id ?? String(oldRow.debit_account_id);
        const finalCredit = b.credit_account_id ?? String(oldRow.credit_account_id);
        if (finalDebit === finalCredit) {
          return { error: "debit_credit_must_differ" as const };
        }
        const classId =
          "default_class_id" in b ? (b.default_class_id ?? null) : (oldRow.default_class_id as string | null);
        const ok = await assertSameEntityAccounts(client, opco, finalDebit, finalCredit, classId);
        if (ok !== "ok") {
          const err = new Error(ok);
          (err as { code?: string }).code = "23503";
          throw err;
        }

        const res = await client.query(
          `
            UPDATE catalogs.posting_templates
            SET ${setParts.join(", ")}
            WHERE id = $${idIdx} AND operating_company_id = $${opcoIdx}::uuid
            RETURNING ${SELECT_COLS}
          `,
          values
        );
        const updatedRow = res.rows[0] ?? null;
        if (!updatedRow) return null;
        const changes = buildPatchChanges(
          b as unknown as Record<string, unknown>,
          oldRow as Record<string, unknown>,
          updatedRow as Record<string, unknown>
        );
        const isActiveChanged = Object.prototype.hasOwnProperty.call(changes, "is_active");
        const isActiveChangedFrom = oldRow.is_active;
        const isActiveChangedTo = updatedRow.is_active;
        await appendCrudAudit(
          client,
          authUser.uuid,
          "catalogs.posting_templates.updated",
          {
            resource_id: updatedRow.id,
            resource_type: "catalogs.posting_templates",
            changes,
            ...(isActiveChanged
              ? {
                  is_active_changed_from: isActiveChangedFrom,
                  is_active_changed_to: isActiveChangedTo,
                }
              : {}),
          },
          isActiveChanged && isActiveChangedFrom === true && isActiveChangedTo === false ? "warning" : "info"
        );
        return { row: updatedRow };
      });
      if (!updated) return reply.code(404).send({ error: "catalog_posting_template_not_found" });
      if ("error" in updated) return reply.code(400).send({ error: updated.error });
      return updated.row;
    } catch (err) {
      const code = (err as { code?: string }).code;
      const constraint = (err as { constraint?: string }).constraint;
      if (code === "23505") return reply.code(409).send({ error: mapConflict(constraint), field: constraint ?? null });
      if (code === "23503") return reply.code(400).send({ error: "invalid_account_or_class_reference" });
      throw err;
    }
  });

  app.post("/api/v1/catalogs/posting-templates/:id/deactivate", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return reply.code(400).send({ error: "operating_company_id_required" });
    const opco = parsedQuery.data.operating_company_id;

    const deactivated = await withEntityScope(authUser.uuid, opco, async (client) => {
      const oldRes = await client.query(
        `
          SELECT id, is_active
          FROM catalogs.posting_templates
          WHERE id = $1 AND operating_company_id = $2::uuid
          LIMIT 1
        `,
        [parsedParams.data.id, opco]
      );
      const oldRow = oldRes.rows[0] ?? null;
      if (!oldRow) return null;

      let isActive = Boolean(oldRow.is_active);
      const wasAlreadyDeactivated = !isActive;
      if (!wasAlreadyDeactivated) {
        const res = await client.query(
          `
            UPDATE catalogs.posting_templates
            SET is_active = false, updated_by_user_id = $3
            WHERE id = $1 AND operating_company_id = $2::uuid
            RETURNING id, is_active
          `,
          [parsedParams.data.id, opco, authUser.uuid]
        );
        isActive = Boolean(res.rows[0]?.is_active ?? false);
      }

      await appendCrudAudit(
        client,
        authUser.uuid,
        "catalogs.posting_templates.is_active_changed",
        {
          resource_id: oldRow.id,
          resource_type: "catalogs.posting_templates",
          was_already_deactivated: wasAlreadyDeactivated,
          is_active_from: oldRow.is_active,
          is_active_to: false,
        },
        "warning"
      );

      return { id: oldRow.id, is_active: isActive, was_already_deactivated: wasAlreadyDeactivated };
    });
    if (!deactivated) return reply.code(404).send({ error: "catalog_posting_template_not_found" });
    return deactivated;
  });
}
