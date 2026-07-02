import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { MAJOR_DEFECT_CODES } from "./major-defect-catalog.js";
import { setSeverity } from "./dvir-severity.service.js";
import { routeDefect } from "./dvir-routing.service.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const queueQuerySchema = companyQuerySchema.extend({
  severity: z.enum(["major", "minor", "observation"]).optional(),
  status: z.enum(["open", "resolved", "all"]).default("open"),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const idParamsSchema = z.object({ id: z.string().uuid() });

const severityBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  severity: z.enum(["major", "minor", "observation"]),
  major_defect_code: z.string().trim().min(1).optional(),
  reason: z.string().trim().max(500).optional(),
});

const routeBodySchema = z.object({
  operating_company_id: z.string().uuid(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: {
    query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
  }) => Promise<T>
) {
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [operatingCompanyId]);
    return fn(client);
  });
}

export async function registerPreFlightDvirRoutes(app: FastifyInstance) {
  app.get("/api/v1/maintenance/pre-flight/major-defect-catalog", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    return { catalog: MAJOR_DEFECT_CODES };
  });

  app.get("/api/v1/maintenance/pre-flight/dvir-queue", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = queueQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const filters: string[] = ["dd.operating_company_id = $1"];
      const values: unknown[] = [query.data.operating_company_id];
      let idx = 2;

      if (query.data.status === "open") {
        filters.push("dd.resolved_at IS NULL");
      } else if (query.data.status === "resolved") {
        filters.push("dd.resolved_at IS NOT NULL");
      }

      const severityExpr = "COALESCE(tag.severity, dd.severity)";
      if (query.data.severity) {
        filters.push(`${severityExpr} = $${idx++}`);
        values.push(query.data.severity);
      }
      values.push(query.data.limit, query.data.offset);

      const res = await client.query(
        `
          SELECT
            dd.id,
            dd.dvir_submission_id,
            dd.unit_id,
            dd.item_key,
            dd.notes,
            dd.severity AS submitted_severity,
            dd.resolved_at,
            dd.created_at,
            ${severityExpr} AS severity,
            tag.major_defect_code,
            tag.source AS severity_source,
            tag.routed,
            tag.auto_wo_id,
            ds.submitted_at,
            ds.type AS dvir_type,
            ds.driver_id,
            ds.load_id,
            u.unit_number,
            TRIM(CONCAT(dr.first_name, ' ', dr.last_name)) AS driver_name
          FROM safety.dvir_defects dd
          LEFT JOIN LATERAL (
            SELECT severity, major_defect_code, source, routed, auto_wo_id
            FROM safety.dvir_defect_severity_tags t
            WHERE t.dvir_defect_id = dd.id
            ORDER BY t.created_at DESC
            LIMIT 1
          ) tag ON true
          LEFT JOIN safety.dvir_submissions ds ON ds.id = dd.dvir_submission_id
          LEFT JOIN mdata.units u ON u.id = dd.unit_id
          LEFT JOIN mdata.drivers dr ON dr.id = ds.driver_id
          WHERE ${filters.join(" AND ")}
          ORDER BY
            CASE ${severityExpr} WHEN 'major' THEN 0 WHEN 'minor' THEN 1 ELSE 2 END,
            dd.created_at DESC
          LIMIT $${idx++} OFFSET $${idx}
        `,
        values
      );
      return res.rows;
    });

    return { defects: rows };
  });

  app.patch("/api/v1/maintenance/pre-flight/defects/:id/severity", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = severityBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const result = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) =>
      setSeverity(client, {
        operatingCompanyId: body.data.operating_company_id,
        defectId: params.data.id,
        severity: body.data.severity,
        majorDefectCode: body.data.major_defect_code ?? null,
        userId: user.uuid,
        role: user.role,
        reason: body.data.reason ?? null,
      })
    );

    if ("error" in result) {
      if (result.error === "defect_not_found") return reply.code(404).send({ error: "defect_not_found" });
      if (result.error === "forbidden_major_override") return reply.code(403).send({ error: "forbidden_major_override" });
      return reply.code(400).send({ error: result.error });
    }
    return reply.code(200).send(result);
  });

  app.post("/api/v1/maintenance/pre-flight/defects/:id/route", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = routeBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const result = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) =>
      routeDefect(client, user.uuid, body.data.operating_company_id, params.data.id)
    );

    if ("error" in result) {
      return reply.code(404).send({ error: result.error });
    }
    return reply.code(200).send(result);
  });
}
