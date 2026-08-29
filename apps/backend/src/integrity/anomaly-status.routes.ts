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
  subject_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
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
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
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
    subject_display_name: row.subject_display_name ? String(row.subject_display_name) : null,
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
  app.get("/api/v1/integrity/anomalies", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;

    const tenantId = requireTenant(req.query, reply);
    if (!tenantId) return;

    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const result = await withTenantScope(user.uuid, tenantId, async (client) => {
      const values: unknown[] = [tenantId];
      const filters: string[] = ["a.tenant_id = $1::uuid"];

      if (parsed.data.status) {
        values.push(parsed.data.status);
        filters.push(`a.status = $${values.length}::text`);
      }
      if (parsed.data.severity) {
        values.push(parsed.data.severity);
        filters.push(`a.severity = $${values.length}::text`);
      }
      if (parsed.data.subject) {
        values.push(parsed.data.subject);
        filters.push(`a.subject_type = $${values.length}::text`);
      }
      if (parsed.data.subject_id) {
        values.push(parsed.data.subject_id);
        filters.push(`a.subject_id = $${values.length}::uuid`);
      }

      const countResult = await client.query<{ total_count: string }>(
        `SELECT COUNT(*)::text AS total_count FROM integrity.anomalies a WHERE ${filters.join(" AND ")}`,
        values
      );
      values.push(parsed.data.limit, parsed.data.offset);
      const pageResult = await client.query(
        `
          SELECT
            a.id::text,
            a.tenant_id::text,
            a.anomaly_type::text,
            a.severity::text,
            a.subject_type::text,
            a.subject_id::text,
            CASE a.subject_type
              WHEN 'driver' THEN NULLIF(TRIM(CONCAT_WS(' ', d.first_name, d.last_name)), '')
              WHEN 'unit' THEN u.unit_number
              WHEN 'customer' THEN c.customer_name
              WHEN 'invoice' THEN i.display_id
              ELSE NULL
            END AS subject_display_name,
            a.detected_at::text,
            a.detector_version::text,
            a.evidence,
            a.status::text,
            a.status_changed_at::text,
            a.status_changed_by::text,
            a.resolution_note
          FROM integrity.anomalies a
          LEFT JOIN mdata.drivers d
            ON a.subject_type = 'driver'
           AND d.id = a.subject_id
           AND (
                d.operating_company_id = a.tenant_id
             OR EXISTS (
                  SELECT 1
                  FROM mdata.driver_company_authorizations anomaly_driver_dca
                  WHERE anomaly_driver_dca.driver_id = d.id
                    AND anomaly_driver_dca.company_id = a.tenant_id
                    AND anomaly_driver_dca.is_authorized = true
                    AND anomaly_driver_dca.deactivated_at IS NULL
                )
           )
          LEFT JOIN mdata.units u
            ON a.subject_type = 'unit'
           AND u.id = a.subject_id
           AND (u.owner_company_id = a.tenant_id OR u.currently_leased_to_company_id = a.tenant_id)
          LEFT JOIN mdata.customers c
            ON a.subject_type = 'customer'
           AND c.id = a.subject_id
           AND c.operating_company_id = a.tenant_id
          LEFT JOIN accounting.invoices i
            ON a.subject_type = 'invoice'
           AND i.id = a.subject_id
           AND i.operating_company_id = a.tenant_id
          WHERE ${filters.join(" AND ")}
          ORDER BY a.detected_at DESC, a.id DESC
          LIMIT $${values.length - 1}::int OFFSET $${values.length}::int
        `,
        values
      );
      return {
        anomalies: pageResult.rows.map((row) => mapAnomalyRow(row)),
        total_count: Number(countResult.rows[0]?.total_count ?? 0),
      };
    });

    return result;
  });

  app.get("/api/v1/integrity/anomalies/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
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
            a.id::text,
            a.tenant_id::text,
            a.anomaly_type::text,
            a.severity::text,
            a.subject_type::text,
            a.subject_id::text,
            CASE a.subject_type
              WHEN 'driver' THEN NULLIF(TRIM(CONCAT_WS(' ', d.first_name, d.last_name)), '')
              WHEN 'unit' THEN u.unit_number
              WHEN 'customer' THEN c.customer_name
              WHEN 'invoice' THEN i.display_id
              ELSE NULL
            END AS subject_display_name,
            a.detected_at::text,
            a.detector_version::text,
            a.evidence,
            a.status::text,
            a.status_changed_at::text,
            a.status_changed_by::text,
            a.resolution_note
          FROM integrity.anomalies a
          LEFT JOIN mdata.drivers d
            ON a.subject_type = 'driver'
           AND d.id = a.subject_id
           AND (
                d.operating_company_id = a.tenant_id
             OR EXISTS (
                  SELECT 1
                  FROM mdata.driver_company_authorizations anomaly_driver_dca
                  WHERE anomaly_driver_dca.driver_id = d.id
                    AND anomaly_driver_dca.company_id = a.tenant_id
                    AND anomaly_driver_dca.is_authorized = true
                    AND anomaly_driver_dca.deactivated_at IS NULL
                )
           )
          LEFT JOIN mdata.units u
            ON a.subject_type = 'unit'
           AND u.id = a.subject_id
           AND (u.owner_company_id = a.tenant_id OR u.currently_leased_to_company_id = a.tenant_id)
          LEFT JOIN mdata.customers c
            ON a.subject_type = 'customer'
           AND c.id = a.subject_id
           AND c.operating_company_id = a.tenant_id
          LEFT JOIN accounting.invoices i
            ON a.subject_type = 'invoice'
           AND i.id = a.subject_id
           AND i.operating_company_id = a.tenant_id
          WHERE a.id = $1::uuid
            AND a.tenant_id = $2::uuid
          LIMIT 1
        `,
        [params.data.id, tenantId]
      );

      return result.rows[0] ? mapAnomalyRow(result.rows[0]) : null;
    });

    if (!anomaly) return reply.code(404).send({ error: "anomaly_not_found" });
    return { anomaly };
  });

  app.post("/api/v1/integrity/anomalies/:id/acknowledge", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
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

  app.post("/api/v1/integrity/anomalies/:id/resolve", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
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

  app.post("/api/v1/integrity/anomalies/:id/dismiss", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
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
