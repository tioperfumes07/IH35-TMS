import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const appliesToSchema = z.enum(["driver", "customer", "vendor", "unit", "equipment", "load", "settlement", "invoice", "standalone"]);

const listFileCategoriesQuerySchema = z.object({
  applies_to: appliesToSchema.optional(),
});

const createFileCategoryBodySchema = z.object({
  code: z.string().trim().regex(/^[a-z0-9_]+$/).min(2).max(80),
  label: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  applies_to: z.array(appliesToSchema).min(1).max(12),
  typical_expiration_months: z.number().int().min(1).max(240).nullable().optional(),
  requires_expiration_date: z.boolean().optional(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

export async function registerFileCategoriesRoutes(app: FastifyInstance) {
  app.get("/api/v1/catalogs/file-categories", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const parsedQuery = listFileCategoriesQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const result = await withCurrentUser(user.uuid, async (client) => {
      const values: unknown[] = [];
      let whereClause = "WHERE deactivated_at IS NULL AND is_active = true";
      if (parsedQuery.data.applies_to) {
        values.push(parsedQuery.data.applies_to);
        whereClause += ` AND $1 = ANY(applies_to)`;
      }
      const res = await client.query(
        `
          SELECT
            id,
            code,
            label,
            description,
            applies_to,
            typical_expiration_months,
            requires_expiration_date,
            is_active,
            deactivated_at,
            created_at,
            updated_at
          FROM catalogs.file_categories
          ${whereClause}
          ORDER BY label
        `,
        values
      );
      return res.rows;
    });
    return { categories: result };
  });

  app.post("/api/v1/catalogs/file-categories", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!["Owner", "Administrator"].includes(user.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedBody = createFileCategoryBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    try {
      const created = await withCurrentUser(user.uuid, async (client) => {
        const res = await client.query(
          `
            INSERT INTO catalogs.file_categories (
              code,
              label,
              description,
              applies_to,
              typical_expiration_months,
              requires_expiration_date,
              created_by_user_id,
              updated_by_user_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
            RETURNING
              id,
              code,
              label,
              description,
              applies_to,
              typical_expiration_months,
              requires_expiration_date,
              is_active,
              deactivated_at,
              created_at,
              updated_at
          `,
          [
            parsedBody.data.code,
            parsedBody.data.label,
            parsedBody.data.description ?? null,
            parsedBody.data.applies_to,
            parsedBody.data.typical_expiration_months ?? null,
            parsedBody.data.requires_expiration_date ?? false,
            user.uuid,
          ]
        );
        return res.rows[0];
      });
      return reply.code(201).send({ category: created });
    } catch (error) {
      if ((error as { code?: string }).code === "23505") return reply.code(409).send({ error: "file_category_code_conflict" });
      throw error;
    }
  });
}
