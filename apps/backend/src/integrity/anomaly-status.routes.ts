import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import {
  ANOMALY_SEVERITIES,
  ANOMALY_STATUSES,
  ANOMALY_SUBJECT_TYPES,
  AnomalySchema,
} from "./anomaly.shared.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

const listQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  status: z.enum(ANOMALY_STATUSES).optional(),
  severity: z.enum(ANOMALY_SEVERITIES).optional(),
  subject: z.enum(ANOMALY_SUBJECT_TYPES).optional(),
});

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

const tenantBodySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const resolveBodySchema = tenantBodySchema.extend({
  resolution_note: z.string().trim().min(1),
});

function validationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function requireTenant(source: unknown, reply: FastifyReply): string | null {
  const parsed = z.object({ operating_company_id: z.string().uuid() }).safeParse(source ?? {});
  if (!parsed.success) {
    void validationError(reply, parsed.error);
    return null;
  }
  return parsed.data.operating_company_id;
}

async function withTenantScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: Queryable) => Promise<T>
): Promise<T> {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    return fn(client as Queryable);
  });
}

function mapAnomalyRow(row: Record<string, unknown>) {
  return AnomalySchema.parse({
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    anomaly_type: String(row.anomaly_type),
    severity: String(row.severity),
    subject_type: String(row.subject_type),
    subject_id: String(row.subject_id),
    detected_at: String(row.detected_at),
    detector_version: String(row.detector_version),
    evidence:
      row.evidence && typeof row.evidence === "object" && !Array.isArray(row.evidence)
        ? (row.evidence as Record<string, unknown>)
        : {},
    status: String(row.status),
    status_changed_at: row.status_changed_at ? String(row.status_changed_at) : null,
    status_changed_by: row.status_changed_by ? String(row.status_changed_by) : null,
    resolution_note: row.resolution_note ? String(row.resolution_note) : null,
  });
}

export async function registerAnomalyStatusRoutes(app: FastifyInstance) {
  app.get("/api/v1/integrity/anomalies", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;

    const tenantId = requireTenant(req.query, reply);
    if (!tenantId) return;

    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const anomalies = await withTenantScope(user.uuid, tenantId, async (client) => {
      const values: unknown[] = [tenantId];
      const filters: string[] = ["tenant_id = $1::uuid"];

      if (parsed.data.status) {
        values.push(parsed.data.status);
        filters.push(`status = $${values.length}::text`);
      }
      if (parsed.data.severity) {
        values.push(parsed.data.severity);
        filters.push(`severity = $${values.length}::text`);
      }
      if (parsed.data.subject) {
        values.push(parsed.data.subject);
        filters.push(`subject_type = $${values.length}::text`);
      }

      const result = await client.query(
        `
          SELECT
            id::text,
            tenant_id::text,
            anomaly_type::text,
            severity::text,
            subject_type::text,
            subject_id::text,
            detected_at::text,
            detector_version::text,
            evidence,
            status::text,
            status_changed_at::text,
            status_changed_by::text,
            resolution_note
          FROM integrity.anomalies
          WHERE ${filters.join(" AND ")}
          ORDER BY detected_at DESC, id DESC
        `,
        values
      );
      return result.rows.map((row) => mapAnomalyRow(row));
    });

    return { anomalies };
  });

  app.get("/api/v1/integrity/anomalies/:id", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;

    const tenantId = requireTenant(req.query, reply);
    if (!tenantId) return;

    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);

    const anomaly = await withTenantScope(user.uuid, tenantId, async (client) => {
      const result = await client.query(
        `
          SELECT
            id::text,
            tenant_id::text,
            anomaly_type::text,
            severity::text,
            subject_type::text,
            subject_id::text,
            detected_at::text,
            detector_version::text,
            evidence,
            status::text,
            status_changed_at::text,
            status_changed_by::text,
            resolution_note
          FROM integrity.anomalies
          WHERE id = $1::uuid
            AND tenant_id = $2::uuid
          LIMIT 1
        `,
        [params.data.id, tenantId]
      );

      return result.rows[0] ? mapAnomalyRow(result.rows[0]) : null;
    });

    if (!anomaly) return reply.code(404).send({ error: "anomaly_not_found" });
    return { anomaly };
  });

  app.post("/api/v1/integrity/anomalies/:id/acknowledge", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;

    const tenantId = requireTenant(req.body, reply);
    if (!tenantId) return;

    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const body = tenantBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const anomaly = await withTenantScope(user.uuid, tenantId, async (client) => {
      const result = await client.query(
        `
          UPDATE integrity.anomalies
          SET
            status = 'acknowledged',
            status_changed_at = now(),
            status_changed_by = $3::uuid
          WHERE id = $1::uuid
            AND tenant_id = $2::uuid
            AND status <> 'dismissed'
          RETURNING
            id::text,
            tenant_id::text,
            anomaly_type::text,
            severity::text,
            subject_type::text,
            subject_id::text,
            detected_at::text,
            detector_version::text,
            evidence,
            status::text,
            status_changed_at::text,
            status_changed_by::text,
            resolution_note
        `,
        [params.data.id, body.data.operating_company_id, user.uuid]
      );

      return result.rows[0] ? mapAnomalyRow(result.rows[0]) : null;
    });

    if (!anomaly) return reply.code(404).send({ error: "anomaly_not_found" });
    return { anomaly };
  });

  app.post("/api/v1/integrity/anomalies/:id/resolve", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;

    const tenantId = requireTenant(req.body, reply);
    if (!tenantId) return;

    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const body = resolveBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const anomaly = await withTenantScope(user.uuid, tenantId, async (client) => {
      const result = await client.query(
        `
          UPDATE integrity.anomalies
          SET
            status = 'resolved',
            status_changed_at = now(),
            status_changed_by = $3::uuid,
            resolution_note = $4::text
          WHERE id = $1::uuid
            AND tenant_id = $2::uuid
          RETURNING
            id::text,
            tenant_id::text,
            anomaly_type::text,
            severity::text,
            subject_type::text,
            subject_id::text,
            detected_at::text,
            detector_version::text,
            evidence,
            status::text,
            status_changed_at::text,
            status_changed_by::text,
            resolution_note
        `,
        [params.data.id, body.data.operating_company_id, user.uuid, body.data.resolution_note]
      );

      return result.rows[0] ? mapAnomalyRow(result.rows[0]) : null;
    });

    if (!anomaly) return reply.code(404).send({ error: "anomaly_not_found" });
    return { anomaly };
  });

  app.post("/api/v1/integrity/anomalies/:id/dismiss", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;

    const tenantId = requireTenant(req.body, reply);
    if (!tenantId) return;

    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const body = resolveBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const anomaly = await withTenantScope(user.uuid, tenantId, async (client) => {
      const result = await client.query(
        `
          UPDATE integrity.anomalies
          SET
            status = 'dismissed',
            status_changed_at = now(),
            status_changed_by = $3::uuid,
            resolution_note = $4::text
          WHERE id = $1::uuid
            AND tenant_id = $2::uuid
          RETURNING
            id::text,
            tenant_id::text,
            anomaly_type::text,
            severity::text,
            subject_type::text,
            subject_id::text,
            detected_at::text,
            detector_version::text,
            evidence,
            status::text,
            status_changed_at::text,
            status_changed_by::text,
            resolution_note
        `,
        [params.data.id, body.data.operating_company_id, user.uuid, body.data.resolution_note]
      );

      return result.rows[0] ? mapAnomalyRow(result.rows[0]) : null;
    });

    if (!anomaly) return reply.code(404).send({ error: "anomaly_not_found" });
    return { anomaly };
  });
}
