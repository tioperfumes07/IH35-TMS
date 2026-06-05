import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../../accounting/shared.js";

const splitTypeSchema = z.enum(["percentage", "fixed", "mileage"]);
const statusSchema = z.enum(["active", "paused", "ended"]);

const createConfigSchema = z
  .object({
    primary_driver_id: z.string().uuid(),
    secondary_driver_id: z.string().uuid(),
    split_type: splitTypeSchema.default("percentage"),
    primary_ratio: z.coerce.number().min(0.01).max(1),
    secondary_ratio: z.coerce.number().min(0.01).max(1),
    effective_from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    effective_to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    memo: z.string().trim().max(2000).optional(),
  })
  .refine((body) => body.primary_driver_id !== body.secondary_driver_id, {
    message: "primary and secondary driver must differ",
    path: ["secondary_driver_id"],
  })
  .refine((body) => Math.abs(body.primary_ratio + body.secondary_ratio - 1) < 0.0001, {
    message: "ratios must sum to 1",
    path: ["secondary_ratio"],
  });

const listQuerySchema = companyQuerySchema.extend({
  driver_id: z.string().uuid().optional(),
  status: statusSchema.optional(),
});

const idParamsSchema = z.object({ id: z.string().uuid() });
const loadIdParamsSchema = z.object({ id: z.string().uuid() });

const loadOverrideSchema = z
  .object({
    operating_company_id: z.string().uuid(),
    primary_driver_id: z.string().uuid(),
    secondary_driver_id: z.string().uuid(),
    primary_ratio: z.coerce.number().min(0.01).max(1),
    secondary_ratio: z.coerce.number().min(0.01).max(1),
    reason: z.enum(["one_off_team", "config_override"]).default("one_off_team"),
  })
  .refine((body) => body.primary_driver_id !== body.secondary_driver_id, {
    message: "primary and secondary driver must differ",
    path: ["secondary_driver_id"],
  })
  .refine((body) => Math.abs(body.primary_ratio + body.secondary_ratio - 1) < 0.0001, {
    message: "ratios must sum to 1",
    path: ["secondary_ratio"],
  });

export async function registerTeamSplitRoutes(app: FastifyInstance) {
  app.get("/api/v1/team-splits/configs", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const filters: string[] = ["operating_company_id = $1::uuid"];
      const values: unknown[] = [query.data.operating_company_id];
      if (query.data.driver_id) {
        values.push(query.data.driver_id);
        filters.push(`(primary_driver_id = $${values.length}::uuid OR secondary_driver_id = $${values.length}::uuid)`);
      }
      if (query.data.status) {
        values.push(query.data.status);
        filters.push(`status = $${values.length}`);
      }
      const res = await client.query(
        `
          SELECT
            c.*,
            p.first_name || ' ' || p.last_name AS primary_driver_name,
            s.first_name || ' ' || s.last_name AS secondary_driver_name
          FROM settlements.team_split_configs c
          JOIN mdata.drivers p ON p.id = c.primary_driver_id
          JOIN mdata.drivers s ON s.id = c.secondary_driver_id
          WHERE ${filters.join(" AND ")}
          ORDER BY c.created_at DESC
        `,
        values
      );
      return res.rows;
    });

    return { configs: rows };
  });

  app.post("/api/v1/team-splits/configs", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = createConfigSchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const row = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          INSERT INTO settlements.team_split_configs (
            operating_company_id,
            primary_driver_id,
            secondary_driver_id,
            split_type,
            primary_ratio,
            secondary_ratio,
            effective_from_date,
            effective_to_date,
            created_by_user_id,
            status,
            memo
          )
          VALUES (
            $1::uuid, $2::uuid, $3::uuid, $4, $5, $6,
            COALESCE($7::date, CURRENT_DATE), $8::date, $9::uuid, 'active', $10
          )
          RETURNING *
        `,
        [
          query.data.operating_company_id,
          body.data.primary_driver_id,
          body.data.secondary_driver_id,
          body.data.split_type,
          body.data.primary_ratio,
          body.data.secondary_ratio,
          body.data.effective_from_date ?? null,
          body.data.effective_to_date ?? null,
          user.uuid,
          body.data.memo ?? null,
        ]
      );
      const config = res.rows[0];
      await appendCrudAudit(
        client,
        user.uuid,
        "settlements.team_split_config.created",
        { resource_type: "settlements.team_split_configs", resource_id: String(config?.id ?? "") },
        "info",
        "P5-T14-TEAM-SPLITS"
      );
      return config;
    });

    return reply.code(201).send({ config: row });
  });

  app.delete("/api/v1/team-splits/configs/:id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);

    const updated = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE settlements.team_split_configs
          SET status = 'ended',
              effective_to_date = COALESCE(effective_to_date, CURRENT_DATE),
              updated_at = now()
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
            AND status <> 'ended'
          RETURNING id
        `,
        [params.data.id, query.data.operating_company_id]
      );
      if (res.rows[0]?.id) {
        await appendCrudAudit(
          client,
          user.uuid,
          "settlements.team_split_config.ended",
          { resource_type: "settlements.team_split_configs", resource_id: String(res.rows[0].id) },
          "warning",
          "P5-T14-TEAM-SPLITS"
        );
      }
      return res.rows[0] ?? null;
    });

    if (!updated) return reply.code(404).send({ error: "config_not_found" });
    return { ok: true };
  });

  app.post("/api/v1/loads/:id/team-split", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = loadIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const body = loadOverrideSchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const row = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          INSERT INTO settlements.team_split_load_overrides (
            operating_company_id,
            load_id,
            primary_driver_id,
            secondary_driver_id,
            primary_ratio,
            secondary_ratio,
            reason,
            created_by_user_id
          )
          VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8::uuid)
          ON CONFLICT (load_id) DO UPDATE SET
            primary_driver_id = EXCLUDED.primary_driver_id,
            secondary_driver_id = EXCLUDED.secondary_driver_id,
            primary_ratio = EXCLUDED.primary_ratio,
            secondary_ratio = EXCLUDED.secondary_ratio,
            reason = EXCLUDED.reason,
            created_by_user_id = EXCLUDED.created_by_user_id
          RETURNING *
        `,
        [
          body.data.operating_company_id,
          params.data.id,
          body.data.primary_driver_id,
          body.data.secondary_driver_id,
          body.data.primary_ratio,
          body.data.secondary_ratio,
          body.data.reason,
          user.uuid,
        ]
      );
      return res.rows[0];
    });

    return reply.code(201).send({ override: row });
  });
}

export default fp(
  async (app) => {
    await registerTeamSplitRoutes(app);
  },
  { name: "settlements.registerTeamSplitRoutes" }
);
