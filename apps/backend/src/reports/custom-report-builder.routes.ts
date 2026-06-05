import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError, withCompanyScope } from "./shared.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

const fieldSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
});

const createBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  base_view: z.string().trim().min(1).max(120).default("run_log"),
  fields: z.array(fieldSchema).default([]),
  filters: z.record(z.string(), z.unknown()).default({}),
  group_by: z.array(z.string()).default([]),
  sort_by: z.array(z.object({ field: z.string(), direction: z.enum(["asc", "desc"]) })).default([]),
  is_shared: z.boolean().optional(),
});

const patchBodySchema = createBodySchema.partial().extend({
  operating_company_id: z.string().uuid(),
});

const AVAILABLE_FIELDS = [
  { id: "report_id", label: "Report ID" },
  { id: "report_name", label: "Report name" },
  { id: "user_role", label: "User role" },
  { id: "run_at", label: "Run timestamp" },
  { id: "duration_ms", label: "Duration (ms)" },
  { id: "rows_returned", label: "Rows returned" },
  { id: "customer_name", label: "Customer name" },
  { id: "vendor_name", label: "Vendor name" },
  { id: "unit_number", label: "Unit number" },
  { id: "amount_cents", label: "Amount (cents)" },
];

function mapDefinition(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    operating_company_id: String(row.operating_company_id),
    owner_user_id: String(row.owner_user_id),
    name: String(row.name),
    base_view: String(row.base_view),
    fields: row.fields ?? [],
    filters: row.filters ?? {},
    group_by: row.group_by ?? [],
    sort_by: row.sort_by ?? [],
    is_shared: Boolean(row.is_shared),
    created_at: row.created_at ? new Date(String(row.created_at)).toISOString() : null,
    updated_at: row.updated_at ? new Date(String(row.updated_at)).toISOString() : null,
  };
}

export async function registerCustomReportBuilderRoutes(app: FastifyInstance) {
  app.get("/api/v1/reports/custom-definitions/fields", async (_req, reply) => {
    return { fields: AVAILABLE_FIELDS };
  });

  app.get("/api/v1/reports/custom-definitions", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT *
          FROM reports.custom_report_definitions
          WHERE operating_company_id = $1::uuid
            AND (owner_user_id = $2::uuid OR is_shared = true)
          ORDER BY updated_at DESC
        `,
        [query.data.operating_company_id, user.uuid]
      );
      return res.rows;
    });

    return { rows: rows.map(mapDefinition) };
  });

  app.post("/api/v1/reports/custom-definitions", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const parsed = createBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const row = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          INSERT INTO reports.custom_report_definitions (
            operating_company_id, owner_user_id, name, base_view,
            fields, filters, group_by, sort_by, is_shared
          )
          VALUES ($1::uuid, $2::uuid, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9)
          RETURNING *
        `,
        [
          parsed.data.operating_company_id,
          user.uuid,
          parsed.data.name,
          parsed.data.base_view,
          JSON.stringify(parsed.data.fields),
          JSON.stringify(parsed.data.filters),
          JSON.stringify(parsed.data.group_by),
          JSON.stringify(parsed.data.sort_by),
          parsed.data.is_shared ?? false,
        ]
      );
      return res.rows[0];
    });

    return reply.code(201).send(mapDefinition(row));
  });

  app.patch("/api/v1/reports/custom-definitions/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const parsed = patchBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const row = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const sets: string[] = [];
      const values: unknown[] = [params.data.id, parsed.data.operating_company_id, user.uuid];
      const push = (col: string, val: unknown, cast = "") => {
        values.push(val);
        sets.push(`${col} = $${values.length}${cast}`);
      };

      if (parsed.data.name) push("name", parsed.data.name);
      if (parsed.data.base_view) push("base_view", parsed.data.base_view);
      if (parsed.data.fields) push("fields", JSON.stringify(parsed.data.fields), "::jsonb");
      if (parsed.data.filters) push("filters", JSON.stringify(parsed.data.filters), "::jsonb");
      if (parsed.data.group_by) push("group_by", JSON.stringify(parsed.data.group_by), "::jsonb");
      if (parsed.data.sort_by) push("sort_by", JSON.stringify(parsed.data.sort_by), "::jsonb");
      if (parsed.data.is_shared !== undefined) push("is_shared", parsed.data.is_shared);

      if (sets.length === 0) return null;

      const res = await client.query(
        `
          UPDATE reports.custom_report_definitions
          SET ${sets.join(", ")}, updated_at = now()
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
            AND owner_user_id = $3::uuid
          RETURNING *
        `,
        values
      );
      return res.rows[0] ?? null;
    });

    if (!row) return reply.code(404).send({ error: "not_found" });
    return mapDefinition(row);
  });

  app.delete("/api/v1/reports/custom-definitions/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const deleted = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          DELETE FROM reports.custom_report_definitions
          WHERE id = $1::uuid AND operating_company_id = $2::uuid AND owner_user_id = $3::uuid
          RETURNING id
        `,
        [params.data.id, query.data.operating_company_id, user.uuid]
      );
      return Boolean(res.rows[0]?.id);
    });

    if (!deleted) return reply.code(404).send({ error: "not_found" });
    return { ok: true };
  });

  app.post("/api/v1/reports/custom-definitions/:id/run", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const defRes = await client.query(
        `
          SELECT *
          FROM reports.custom_report_definitions
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
            AND (owner_user_id = $3::uuid OR is_shared = true)
          LIMIT 1
        `,
        [params.data.id, query.data.operating_company_id, user.uuid]
      );
      const def = defRes.rows[0];
      if (!def) return { code: 404 as const };

      const fieldIds = Array.isArray(def.fields)
        ? (def.fields as Array<{ id?: string }>)
            .map((f) => f.id)
            .filter((id): id is string => typeof id === "string" && id.length > 0)
        : [];

      const runRes = await client.query(
        `
          SELECT report_id, report_name, user_role, run_at, duration_ms, rows_returned, filters
          FROM reports.run_log
          WHERE operating_company_id = $1::uuid
          ORDER BY run_at DESC
          LIMIT 500
        `,
        [query.data.operating_company_id]
      );

      const rows = runRes.rows.map((row: Record<string, unknown>) => {
        const out: Record<string, unknown> = {};
        for (const fid of fieldIds.length ? fieldIds : ["report_id", "report_name", "run_at", "rows_returned"]) {
          out[fid] = row[fid] ?? null;
        }
        return out;
      });

      await client.query(
        `
          INSERT INTO reports.run_log (operating_company_id, report_id, report_name, user_id, user_role, filters, rows_returned)
          VALUES ($1::uuid, $2, $3, $4::uuid, $5, $6::jsonb, $7)
        `,
        [
          query.data.operating_company_id,
          `custom:${def.id}`,
          String(def.name),
          user.uuid,
          String(user.role ?? "Owner"),
          JSON.stringify({ custom_definition_id: def.id, fields: fieldIds }),
          rows.length,
        ]
      );

      return { code: 200 as const, data: { name: String(def.name), rows, row_count: rows.length } };
    });

    if (payload.code === 404) return reply.code(404).send({ error: "not_found" });
    return payload.data;
  });
}
