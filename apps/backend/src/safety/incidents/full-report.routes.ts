import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../../auth/db.js";
import { requireDriverSession } from "../../driver/auth.js";
import { triggerIncidentAutoWorkflow } from "./auto-workflow-trigger.js";
import { createFullIncidentReport } from "./full-report.service.js";

const witnessSchema = z.object({
  name: z.string().trim().max(120).default(""),
  phone: z.string().trim().max(40).default(""),
  statement: z.string().trim().max(2000).default(""),
});

const policeReportSchema = z.object({
  has_report: z.boolean().default(false),
  report_number: z.string().trim().max(120).nullable().optional(),
  agency: z.string().trim().max(200).nullable().optional(),
  officer_name: z.string().trim().max(200).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

const fullReportBodySchema = z.object({
  load_id: z.string().uuid(),
  stop_id: z.string().uuid().nullable().optional(),
  type: z.enum(["accident", "damage", "cargo", "equipment", "injury", "breakdown", "other"]),
  severity: z.enum(["info", "warning", "critical"]).default("warning"),
  incident_subtype: z.string().trim().max(120).nullable().optional(),
  description: z.string().trim().min(10).max(5000),
  location_label: z.string().trim().max(250).default("Driver PWA"),
  geo_lat: z.number().nullable().optional(),
  geo_lng: z.number().nullable().optional(),
  occurred_at: z.string().datetime({ offset: true }),
  photo_keys: z.array(z.string().min(1)).max(24).default([]),
  witnesses: z.array(witnessSchema).max(12).default([]),
  police_report: policeReportSchema.default({ has_report: false }),
  photo_exif: z.array(z.record(z.string(), z.unknown())).max(24).default([]),
});

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function pick(existingColumns: Set<string>, candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (existingColumns.has(candidate)) return candidate;
  }
  return null;
}

export async function registerSafetyIncidentFullReportRoutes(app: FastifyInstance) {
  app.post("/api/v1/safety/incidents/full-report", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    if (!req.user || !req.driver) return reply.code(403).send({ error: "driver_profile_not_found" });
    const body = fullReportBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const result = await withCurrentUser(req.user.uuid, async (client) => {
      const driverRes = await client.query<{ id: string; operating_company_id: string }>(
        `
          SELECT id, operating_company_id
          FROM mdata.drivers
          WHERE id = $1::uuid
            AND identity_user_id = $2::uuid
            AND deactivated_at IS NULL
          LIMIT 1
        `,
        [req.driver!.id, req.user!.uuid]
      );
      const driver = driverRes.rows[0];
      if (!driver) return { kind: "forbidden" as const, code: 403, error: "driver_profile_not_found" };

      const loadColumnsRes = await client.query<{ column_name: string }>(
        `
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = 'mdata'
            AND table_name = 'loads'
        `
      );
      const loadColumns = new Set(loadColumnsRes.rows.map((row) => row.column_name));
      const trailerColumn = pick(loadColumns, ["assigned_trailer_id", "trailer_id"]);

      const loadRes = await client.query<{
        id: string;
        operating_company_id: string;
        assigned_unit_id: string | null;
        assigned_trailer_id: string | null;
        assigned_primary_driver_id: string | null;
        assigned_secondary_driver_id: string | null;
      }>(
        `
          SELECT
            id,
            operating_company_id,
            assigned_unit_id,
            ${trailerColumn ? `${trailerColumn} AS assigned_trailer_id` : "NULL::uuid AS assigned_trailer_id"},
            assigned_primary_driver_id,
            assigned_secondary_driver_id
          FROM mdata.loads
          WHERE id = $1::uuid
            AND soft_deleted_at IS NULL
          LIMIT 1
        `,
        [body.data.load_id]
      );
      const load = loadRes.rows[0];
      if (!load) return { kind: "not_found" as const, code: 404, error: "load_not_found" };
      if (load.operating_company_id !== driver.operating_company_id) {
        return { kind: "forbidden" as const, code: 403, error: "driver_load_mismatch" };
      }
      const ownsLoad = load.assigned_primary_driver_id === driver.id || load.assigned_secondary_driver_id === driver.id;
      if (!ownsLoad) return { kind: "forbidden" as const, code: 403, error: "driver_load_mismatch" };

      const created = await createFullIncidentReport(client, req.user!.uuid, {
        operating_company_id: driver.operating_company_id,
        driver_id: driver.id,
        unit_id: load.assigned_unit_id ?? null,
        trailer_id: load.assigned_trailer_id ?? null,
        load_id: body.data.load_id,
        stop_id: body.data.stop_id ?? null,
        type: body.data.type,
        severity: body.data.severity,
        description: body.data.description,
        incident_subtype: body.data.incident_subtype ?? null,
        occurred_at: body.data.occurred_at,
        location_label: body.data.location_label,
        geo_lat: body.data.geo_lat ?? null,
        geo_lng: body.data.geo_lng ?? null,
        photo_keys: body.data.photo_keys,
        witnesses: body.data.witnesses,
        police_report: body.data.police_report,
        photo_exif: body.data.photo_exif,
      });

      const workflow = await triggerIncidentAutoWorkflow(client, req.user!.uuid, {
        incident_id: String(created.incident.id),
        operating_company_id: driver.operating_company_id,
        driver_id: driver.id,
        unit_id: load.assigned_unit_id ?? null,
        load_id: body.data.load_id,
        type: body.data.type,
        severity: body.data.severity,
        description: body.data.description,
        occurred_at: body.data.occurred_at,
      });

      return {
        kind: "ok" as const,
        incident: created.incident,
        normalized_incident_type: created.normalized_incident_type,
        workflow,
      };
    }).catch((error) => ({
      kind: "error" as const,
      code: 500,
      error: error instanceof Error ? error.message : "incident_full_report_failed",
    }));

    if (result.kind !== "ok") {
      return reply.code(result.code).send({ error: result.error });
    }

    return reply.code(201).send({
      incident: result.incident,
      normalized_incident_type: result.normalized_incident_type,
      workflow: result.workflow,
    });
  });
}
