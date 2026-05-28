import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const assetTypeSchema = z.enum(["tractor", "dry_van", "reefer", "flatbed", "personnel_vehicle", "other"]);
const assetStatusSchema = z.enum(["active", "damaged", "idle", "in_repair", "sold", "retired"]);

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  type: assetTypeSchema.optional(),
  status: assetStatusSchema.optional(),
  active: z.coerce.boolean().optional(),
  operating_company_id: z.string().uuid().optional(),
});

const idParamSchema = z.object({
  id: z.string().uuid(),
});

const createAssetBodySchema = z.object({
  unit_code: z.string().trim().min(1).max(100),
  asset_type: assetTypeSchema,
  vin: z.string().trim().max(100).optional(),
  make: z.string().trim().max(100).optional(),
  model: z.string().trim().max(100).optional(),
  year: z.number().int().min(1980).max(2100).optional(),
  acquisition_cost_cents: z.number().int().nonnegative().optional(),
  insured_value_cents: z.number().int().nonnegative().optional(),
  status: assetStatusSchema.optional(),
  samsara_unit_id: z.string().trim().max(120).optional(),
  owning_entity: z.string().trim().max(120).optional(),
  operating_company_id: z.string().uuid().optional(),
});

const updateAssetBodySchema = z
  .object({
    unit_code: z.string().trim().min(1).max(100).optional(),
    asset_type: assetTypeSchema.optional(),
    vin: z.string().trim().max(100).nullable().optional(),
    make: z.string().trim().max(100).nullable().optional(),
    model: z.string().trim().max(100).nullable().optional(),
    year: z.number().int().min(1980).max(2100).nullable().optional(),
    acquisition_cost_cents: z.number().int().nonnegative().nullable().optional(),
    insured_value_cents: z.number().int().nonnegative().nullable().optional(),
    status: assetStatusSchema.optional(),
    samsara_unit_id: z.string().trim().max(120).nullable().optional(),
    owning_entity: z.string().trim().max(120).nullable().optional(),
    operating_company_id: z.string().uuid().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "at least one field is required" });

type AuthUser = { uuid: string; role: string };

function currentAuthUser(req: FastifyRequest, reply: FastifyReply): AuthUser | null {
  if (!requireAuth(req, reply)) return null;
  return req.user as AuthUser;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function isWriteRole(role: string): boolean {
  return role === "Owner" || role === "Administrator" || role === "Manager" || role === "Accountant";
}

async function resolveOperatingCompanyId(
  userId: string,
  requested?: string
): Promise<string | null> {
  if (requested) {
    await assertCompanyMembership(userId, requested);
    return requested;
  }
  return withCurrentUser(userId, async (client) => {
    const res = await client.query(
      `
        SELECT c.id
        FROM identity.users u
        JOIN org.companies c ON c.id = u.default_company_id
        WHERE u.id = $1
          AND c.deactivated_at IS NULL
        UNION
        SELECT c.id
        FROM org.companies c
        WHERE c.id IN (SELECT org.user_accessible_company_ids())
        ORDER BY id
        LIMIT 1
      `,
      [userId]
    );
    return res.rows[0]?.id ?? null;
  });
}

export async function registerAssetsRoutes(app: FastifyInstance) {
  app.get("/api/v1/assets", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedQuery = listQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);
    const { limit, offset, type, status, active, operating_company_id } = parsedQuery.data;

    const resolvedCompanyId = await resolveOperatingCompanyId(authUser.uuid, operating_company_id);
    if (!resolvedCompanyId) return reply.code(400).send({ error: "operating_company_id_required" });

    const assets = await withCurrentUser(authUser.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [resolvedCompanyId]);

      const values: unknown[] = [resolvedCompanyId];
      const filters = ["tenant_id = $1"];
      if (type) {
        values.push(type);
        filters.push(`asset_type = $${values.length}`);
      }
      if (status) {
        values.push(status);
        filters.push(`status = $${values.length}`);
      }
      if (active === true) {
        filters.push(`status NOT IN ('sold', 'retired')`);
      }
      if (active === false) {
        filters.push(`status IN ('sold', 'retired')`);
      }
      values.push(limit);
      values.push(offset);
      const whereClause = `WHERE ${filters.join(" AND ")}`;
      const res = await client.query(
        `
          SELECT
            id,
            tenant_id,
            unit_code,
            asset_type,
            vin,
            make,
            model,
            year,
            acquisition_cost_cents,
            insured_value_cents,
            status,
            samsara_unit_id,
            owning_entity,
            created_at,
            updated_at
          FROM mdata.assets
          ${whereClause}
          ORDER BY unit_code ASC
          LIMIT $${values.length - 1}
          OFFSET $${values.length}
        `,
        values
      );
      return res.rows;
    });

    return { assets };
  });

  app.get("/api/v1/assets/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = z.object({ operating_company_id: z.string().uuid().optional() }).safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const resolvedCompanyId = await resolveOperatingCompanyId(authUser.uuid, parsedQuery.data.operating_company_id);
    if (!resolvedCompanyId) return reply.code(400).send({ error: "operating_company_id_required" });

    const asset = await withCurrentUser(authUser.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [resolvedCompanyId]);
      const res = await client.query(
        `
          SELECT
            id,
            tenant_id,
            unit_code,
            asset_type,
            vin,
            make,
            model,
            year,
            acquisition_cost_cents,
            insured_value_cents,
            status,
            samsara_unit_id,
            owning_entity,
            created_at,
            updated_at
          FROM mdata.assets
          WHERE id = $1
            AND tenant_id = $2
          LIMIT 1
        `,
        [parsedParams.data.id, resolvedCompanyId]
      );
      return res.rows[0] ?? null;
    });

    if (!asset) return reply.code(404).send({ error: "asset_not_found" });
    return asset;
  });

  app.post("/api/v1/assets", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedBody = createAssetBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const body = parsedBody.data;

    const resolvedCompanyId = await resolveOperatingCompanyId(authUser.uuid, body.operating_company_id);
    if (!resolvedCompanyId) return reply.code(400).send({ error: "operating_company_id_required" });

    try {
      const created = await withCurrentUser(authUser.uuid, async (client) => {
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [resolvedCompanyId]);
        const res = await client.query(
          `
            INSERT INTO mdata.assets (
              tenant_id,
              unit_code,
              asset_type,
              vin,
              make,
              model,
              year,
              acquisition_cost_cents,
              insured_value_cents,
              status,
              samsara_unit_id,
              owning_entity
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
            RETURNING *
          `,
          [
            resolvedCompanyId,
            body.unit_code,
            body.asset_type,
            body.vin ?? null,
            body.make ?? null,
            body.model ?? null,
            body.year ?? null,
            body.acquisition_cost_cents ?? null,
            body.insured_value_cents ?? null,
            body.status ?? "active",
            body.samsara_unit_id ?? null,
            body.owning_entity ?? null,
          ]
        );
        return res.rows[0];
      });
      return reply.code(201).send(created);
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        return reply.code(409).send({ error: "asset_unit_code_conflict" });
      }
      throw error;
    }
  });

  app.patch("/api/v1/assets/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = updateAssetBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const body = parsedBody.data;

    const resolvedCompanyId = await resolveOperatingCompanyId(authUser.uuid, body.operating_company_id);
    if (!resolvedCompanyId) return reply.code(400).send({ error: "operating_company_id_required" });

    const values: unknown[] = [];
    const setParts: string[] = [];
    const add = (column: string, value: unknown) => {
      values.push(value);
      setParts.push(`${column} = $${values.length}`);
    };

    if ("unit_code" in body) add("unit_code", body.unit_code ?? null);
    if ("asset_type" in body) add("asset_type", body.asset_type ?? null);
    if ("vin" in body) add("vin", body.vin ?? null);
    if ("make" in body) add("make", body.make ?? null);
    if ("model" in body) add("model", body.model ?? null);
    if ("year" in body) add("year", body.year ?? null);
    if ("acquisition_cost_cents" in body) add("acquisition_cost_cents", body.acquisition_cost_cents ?? null);
    if ("insured_value_cents" in body) add("insured_value_cents", body.insured_value_cents ?? null);
    if ("status" in body) add("status", body.status ?? null);
    if ("samsara_unit_id" in body) add("samsara_unit_id", body.samsara_unit_id ?? null);
    if ("owning_entity" in body) add("owning_entity", body.owning_entity ?? null);

    values.push(parsedParams.data.id);
    const idIdx = values.length;
    values.push(resolvedCompanyId);
    const companyIdx = values.length;

    const updated = await withCurrentUser(authUser.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [resolvedCompanyId]);
      const res = await client.query(
        `
          UPDATE mdata.assets
          SET ${setParts.join(", ")}
          WHERE id = $${idIdx}
            AND tenant_id = $${companyIdx}
          RETURNING *
        `,
        values
      );
      return res.rows[0] ?? null;
    });

    if (!updated) return reply.code(404).send({ error: "asset_not_found" });
    return updated;
  });
}
