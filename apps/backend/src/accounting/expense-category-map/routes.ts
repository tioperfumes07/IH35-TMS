import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError, withCompanyScope } from "../shared.js";

const CATEGORY_KIND_VALUES = [
  "fuel",
  "maintenance",
  "revenue",
  "driver_pay",
  "factoring_fee",
  "toll",
  "escrow",
  "insurance",
  "office",
  "other",
] as const;

const POSTING_SIDE_VALUES = ["debit", "credit"] as const;

const categoryKindSchema = z.enum(CATEGORY_KIND_VALUES);
const postingSideSchema = z.enum(POSTING_SIDE_VALUES);

const idParamSchema = z.object({ id: z.string().uuid() });

const listQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  include_inactive: z.coerce.boolean().optional().default(false),
  category_kind: categoryKindSchema.optional(),
});

const oneQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const createBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  category_kind: categoryKindSchema,
  category_code: z.string().trim().min(1).max(120),
  account_id: z.string().uuid(),
  posting_side: postingSideSchema,
});

const updateBodySchema = z
  .object({
    operating_company_id: z.string().uuid(),
    category_kind: categoryKindSchema.optional(),
    category_code: z.string().trim().min(1).max(120).optional(),
    account_id: z.string().uuid().optional(),
    posting_side: postingSideSchema.optional(),
    is_active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== "operating_company_id"), {
    message: "at least one mutable field is required",
  });

const removeBodySchema = z.object({
  operating_company_id: z.string().uuid(),
});

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount: number | null }>;
};

function accountingMutationRole(role: string) {
  return ["Owner", "Administrator", "Accountant"].includes(role);
}

async function hasCompanyAccess(client: DbClient, userId: string, operatingCompanyId: string) {
  const access = await client.query(
    `
      SELECT 1
      FROM org.user_company_access uca
      WHERE uca.user_id = $1::uuid
        AND uca.company_id = $2::uuid
      LIMIT 1
    `,
    [userId, operatingCompanyId]
  );
  return (access.rowCount ?? 0) > 0;
}

async function appendExpenseCategoryMapAudit(
  client: DbClient,
  params: {
    operatingCompanyId: string;
    actorUserUuid: string;
    action: "create" | "update" | "deactivate";
    mappingId: string;
    payload: Record<string, unknown>;
  }
) {
  await client.query(
    `
      SELECT audit.append_event(
        $1::text,
        $2::text,
        $3::jsonb,
        $4::uuid,
        $5::uuid
      )
    `,
    [
      "expense_category_map_change",
      "info",
      JSON.stringify({
        action: params.action,
        mapping_id: params.mappingId,
        ...params.payload,
      }),
      params.operatingCompanyId,
      params.actorUserUuid,
    ]
  );
}

export async function registerExpenseCategoryMapRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/expense-category-map", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const result = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client: DbClient) => {
      if (!(await hasCompanyAccess(client, user.uuid, parsed.data.operating_company_id))) {
        return { status: "forbidden" as const };
      }
      const values: unknown[] = [parsed.data.operating_company_id];
      const where: string[] = ["m.operating_company_id = $1::uuid"];
      if (!parsed.data.include_inactive) where.push("m.is_active = true");
      if (parsed.data.category_kind) {
        values.push(parsed.data.category_kind);
        where.push(`m.category_kind = $${values.length}`);
      }
      const rows = await client.query(
        `
          SELECT
            m.id::text AS id,
            m.operating_company_id::text AS operating_company_id,
            m.category_kind,
            m.category_code,
            m.account_id::text AS account_id,
            a.account_number,
            a.account_name,
            m.posting_side,
            m.is_active,
            m.created_at,
            m.updated_at,
            m.created_by_user_uuid::text AS created_by_user_uuid,
            m.updated_by_user_uuid::text AS updated_by_user_uuid
          FROM accounting.expense_category_account_map m
          JOIN catalogs.accounts a ON a.id = m.account_id
          WHERE ${where.join(" AND ")}
          ORDER BY m.category_kind ASC, m.category_code ASC, m.updated_at DESC
        `,
        values
      );
      return { status: "ok" as const, rows: rows.rows };
    });

    if (result.status === "forbidden") return reply.code(403).send({ error: "forbidden" });
    return { rows: result.rows };
  });

  app.get("/api/v1/accounting/expense-category-map/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = oneQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client: DbClient) => {
      if (!(await hasCompanyAccess(client, user.uuid, query.data.operating_company_id))) {
        return { status: "forbidden" as const };
      }
      const row = await client.query(
        `
          SELECT
            m.id::text AS id,
            m.operating_company_id::text AS operating_company_id,
            m.category_kind,
            m.category_code,
            m.account_id::text AS account_id,
            a.account_number,
            a.account_name,
            m.posting_side,
            m.is_active,
            m.created_at,
            m.updated_at,
            m.created_by_user_uuid::text AS created_by_user_uuid,
            m.updated_by_user_uuid::text AS updated_by_user_uuid
          FROM accounting.expense_category_account_map m
          JOIN catalogs.accounts a ON a.id = m.account_id
          WHERE m.id = $1::uuid
            AND m.operating_company_id = $2::uuid
          LIMIT 1
        `,
        [params.data.id, query.data.operating_company_id]
      );
      return { status: "ok" as const, row: row.rows[0] ?? null };
    });

    if (result.status === "forbidden") return reply.code(403).send({ error: "forbidden" });
    if (!result.row) return reply.code(404).send({ error: "expense_category_map_not_found" });
    return result.row;
  });

  app.post("/api/v1/accounting/expense-category-map", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!accountingMutationRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const parsed = createBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    try {
      const result = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client: DbClient) => {
        if (!(await hasCompanyAccess(client, user.uuid, parsed.data.operating_company_id))) {
          return { status: "forbidden" as const };
        }
        const inserted = await client.query(
          `
            INSERT INTO accounting.expense_category_account_map (
              operating_company_id,
              category_kind,
              category_code,
              account_id,
              posting_side,
              created_by_user_uuid,
              updated_by_user_uuid
            )
            VALUES ($1::uuid, $2, $3, $4::uuid, $5, $6::uuid, $6::uuid)
            RETURNING
              id::text AS id,
              operating_company_id::text AS operating_company_id,
              category_kind,
              category_code,
              account_id::text AS account_id,
              posting_side,
              is_active,
              created_at,
              updated_at,
              created_by_user_uuid::text AS created_by_user_uuid,
              updated_by_user_uuid::text AS updated_by_user_uuid
          `,
          [
            parsed.data.operating_company_id,
            parsed.data.category_kind,
            parsed.data.category_code,
            parsed.data.account_id,
            parsed.data.posting_side,
            user.uuid,
          ]
        );
        const row = inserted.rows[0] as Record<string, unknown>;
        await appendExpenseCategoryMapAudit(client, {
          operatingCompanyId: parsed.data.operating_company_id,
          actorUserUuid: user.uuid,
          action: "create",
          mappingId: String(row.id),
          payload: {
            category_kind: parsed.data.category_kind,
            category_code: parsed.data.category_code,
            account_id: parsed.data.account_id,
            posting_side: parsed.data.posting_side,
          },
        });
        return { status: "ok" as const, row };
      });
      if (result.status === "forbidden") return reply.code(403).send({ error: "forbidden" });
      return reply.code(201).send(result.row);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "23503") return reply.code(400).send({ error: "invalid_foreign_key" });
      if (code === "23505") return reply.code(409).send({ error: "active_mapping_already_exists_for_category" });
      if (code === "23514") return reply.code(400).send({ error: "invalid_check_constraint" });
      throw error;
    }
  });

  app.patch("/api/v1/accounting/expense-category-map/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!accountingMutationRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const params = idParamSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const parsed = updateBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    try {
      const result = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client: DbClient) => {
        if (!(await hasCompanyAccess(client, user.uuid, parsed.data.operating_company_id))) {
          return { status: "forbidden" as const };
        }
        const current = await client.query<{
          id: string;
          account_id: string;
          category_kind: string;
          category_code: string;
          posting_side: string;
          is_active: boolean;
        }>(
          `
            SELECT
              id::text AS id,
              account_id::text AS account_id,
              category_kind,
              category_code,
              posting_side,
              is_active
            FROM accounting.expense_category_account_map
            WHERE id = $1::uuid
              AND operating_company_id = $2::uuid
            LIMIT 1
          `,
          [params.data.id, parsed.data.operating_company_id]
        );
        const existing = current.rows[0];
        if (!existing) return { status: "not_found" as const };

        if (parsed.data.account_id && parsed.data.account_id !== existing.account_id) {
          return { status: "account_immutable" as const };
        }

        const fields: string[] = [];
        const values: unknown[] = [];
        const add = (column: string, value: unknown) => {
          values.push(value);
          fields.push(`${column} = $${values.length}`);
        };
        if (parsed.data.category_kind) add("category_kind", parsed.data.category_kind);
        if (parsed.data.category_code) add("category_code", parsed.data.category_code);
        if (parsed.data.posting_side) add("posting_side", parsed.data.posting_side);
        if (parsed.data.is_active !== undefined) add("is_active", parsed.data.is_active);
        add("updated_by_user_uuid", user.uuid);
        values.push(params.data.id, parsed.data.operating_company_id);

        const updated = await client.query(
          `
            UPDATE accounting.expense_category_account_map
            SET ${fields.join(", ")}
            WHERE id = $${values.length - 1}::uuid
              AND operating_company_id = $${values.length}::uuid
            RETURNING
              id::text AS id,
              operating_company_id::text AS operating_company_id,
              category_kind,
              category_code,
              account_id::text AS account_id,
              posting_side,
              is_active,
              created_at,
              updated_at,
              created_by_user_uuid::text AS created_by_user_uuid,
              updated_by_user_uuid::text AS updated_by_user_uuid
          `,
          values
        );
        const row = updated.rows[0] as Record<string, unknown>;
        await appendExpenseCategoryMapAudit(client, {
          operatingCompanyId: parsed.data.operating_company_id,
          actorUserUuid: user.uuid,
          action: "update",
          mappingId: String(row.id),
          payload: {
            before: existing,
            after: row,
          },
        });
        return { status: "ok" as const, row };
      });

      if (result.status === "forbidden") return reply.code(403).send({ error: "forbidden" });
      if (result.status === "not_found") return reply.code(404).send({ error: "expense_category_map_not_found" });
      if (result.status === "account_immutable") {
        return reply.code(409).send({
          error: "account_id_is_immutable_use_deactivate_and_create",
        });
      }
      return result.row;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "23503") return reply.code(400).send({ error: "invalid_foreign_key" });
      if (code === "23505") return reply.code(409).send({ error: "active_mapping_already_exists_for_category" });
      if (code === "23514") return reply.code(400).send({ error: "invalid_check_constraint" });
      throw error;
    }
  });

  app.delete("/api/v1/accounting/expense-category-map/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!accountingMutationRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const params = idParamSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const parsed = removeBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const result = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client: DbClient) => {
      if (!(await hasCompanyAccess(client, user.uuid, parsed.data.operating_company_id))) {
        return { status: "forbidden" as const };
      }

      const updated = await client.query<{ id: string }>(
        `
          UPDATE accounting.expense_category_account_map
          SET is_active = false,
              updated_by_user_uuid = $3::uuid
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
          RETURNING id::text AS id
        `,
        [params.data.id, parsed.data.operating_company_id, user.uuid]
      );
      const row = updated.rows[0];
      if (!row) return { status: "not_found" as const };

      await appendExpenseCategoryMapAudit(client, {
        operatingCompanyId: parsed.data.operating_company_id,
        actorUserUuid: user.uuid,
        action: "deactivate",
        mappingId: row.id,
        payload: {},
      });
      return { status: "ok" as const, id: row.id };
    });

    if (result.status === "forbidden") return reply.code(403).send({ error: "forbidden" });
    if (result.status === "not_found") return reply.code(404).send({ error: "expense_category_map_not_found" });
    return { ok: true, id: result.id };
  });
}
