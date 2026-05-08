import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const createIssueBodySchema = z.object({
  load_id: z.string().uuid(),
  stop_id: z.string().uuid().nullable().optional(),
  type: z.enum([
    "check_engine_warning",
    "mechanical_breakdown",
    "accident_minor",
    "accident_major",
    "cargo_issue",
    "other",
  ]),
  severity: z.enum(["info", "warning", "critical"]),
  description: z.string().trim().min(20),
  location: z.string().trim().min(1),
  geo_lat: z.number().nullable(),
  geo_lng: z.number().nullable(),
  occurred_at: z.string().datetime({ offset: true }),
  photo_keys: z.array(z.string()).default([]),
});

type AppUser = {
  uuid: string;
  role: string;
};

function currentAuthUser(req: FastifyRequest, reply: FastifyReply): AppUser | null {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function mapIncidentCategory(type: z.infer<typeof createIssueBodySchema>["type"]) {
  if (type === "check_engine_warning" || type === "mechanical_breakdown") return "mechanical";
  if (type === "accident_minor" || type === "accident_major") return "safety";
  if (type === "cargo_issue") return "cargo";
  return "other";
}

function mapSeverity(severity: z.infer<typeof createIssueBodySchema>["severity"]) {
  return severity === "critical" ? "severe" : severity;
}

function pickExistingColumn(existingColumns: Set<string>, candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (existingColumns.has(candidate)) return candidate;
  }
  return null;
}

export async function registerIntransitIssuesRoutes(app: FastifyInstance) {
  app.post("/api/v1/dispatch/intransit-issues", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const bodyParsed = createIssueBodySchema.safeParse(req.body ?? {});
    if (!bodyParsed.success) return sendValidationError(reply, bodyParsed.error);
    const body = bodyParsed.data;

    const result = await withCurrentUser(authUser.uuid, async (client) => {
      const driverRes = await client.query<{ id: string; full_name: string | null }>(
        `
          SELECT id, concat_ws(' ', first_name, last_name) AS full_name
          FROM mdata.drivers
          WHERE identity_user_id = $1
            AND deactivated_at IS NULL
          LIMIT 1
        `,
        [authUser.uuid]
      );
      const driver = driverRes.rows[0] ?? null;
      if (!driver) return { kind: "forbidden" as const, code: 403, error: "driver_profile_not_found" };

      const loadRes = await client.query<{ id: string; assigned_unit_id: string | null; assigned_primary_driver_id: string | null; assigned_secondary_driver_id: string | null }>(
        `
          SELECT id, assigned_unit_id, assigned_primary_driver_id, assigned_secondary_driver_id
          FROM mdata.loads
          WHERE id = $1
            AND soft_deleted_at IS NULL
          LIMIT 1
        `,
        [body.load_id]
      );
      const load = loadRes.rows[0] ?? null;
      if (!load) return { kind: "not_found" as const, code: 404, error: "load_not_found" };

      const ownsLoad = load.assigned_primary_driver_id === driver.id || load.assigned_secondary_driver_id === driver.id;
      if (!ownsLoad) return { kind: "forbidden" as const, code: 403, error: "driver_load_mismatch" };
      if (!load.assigned_unit_id) return { kind: "conflict" as const, code: 409, error: "load_missing_assigned_unit" };

      const columnsRes = await client.query<{ column_name: string }>(
        `
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = 'dispatch'
            AND table_name = 'intransit_issues'
        `
      );
      if (columnsRes.rows.length === 0) {
        return { kind: "missing_table" as const, code: 501, error: "dispatch_intransit_issues_table_missing" };
      }
      const columnSet = new Set(columnsRes.rows.map((row) => row.column_name));

      const values: unknown[] = [];
      const cols: string[] = [];
      const placeholders: string[] = [];

      const addValue = (columnName: string, value: unknown) => {
        cols.push(columnName);
        values.push(value);
        placeholders.push(`$${values.length}`);
      };

      const mandatoryMappings: Array<[string[], unknown]> = [
        [["id"], crypto.randomUUID()],
        [["driver_id"], driver.id],
        [["unit_id"], load.assigned_unit_id],
        [["issue_category", "category"], mapIncidentCategory(body.type)],
        [["issue_description", "description"], body.description],
        [["severity"], mapSeverity(body.severity)],
      ];

      for (const [candidates, value] of mandatoryMappings) {
        const col = pickExistingColumn(columnSet, candidates);
        if (!col) {
          return { kind: "invalid_schema" as const, code: 500, error: `missing_column_${candidates[0]}` };
        }
        addValue(col, value);
      }

      const optionalMappings: Array<[string[], unknown]> = [
        [["load_id", "load_uuid"], body.load_id],
        [["stop_id", "stop_uuid"], body.stop_id ?? null],
        [["gps_lat", "lat"], body.geo_lat],
        [["gps_lng", "lng"], body.geo_lng],
        [["gps_label", "location_label"], body.location],
        [["reported_at", "captured_at_server", "captured_at"], body.occurred_at],
        [["status"], "open"],
        [["issue_type", "source_type"], body.type],
        [["photo_keys"], body.photo_keys],
        [["evidence_uuids"], body.photo_keys],
      ];
      for (const [candidates, value] of optionalMappings) {
        const col = pickExistingColumn(columnSet, candidates);
        if (col) addValue(col, value);
      }

      const insertSql = `
        INSERT INTO dispatch.intransit_issues (${cols.join(", ")})
        VALUES (${placeholders.join(", ")})
        RETURNING id, COALESCE(reported_at, now()) AS created_at
      `;
      const insertedRes = await client.query<{ id: string; created_at: string }>(insertSql, values);
      const inserted = insertedRes.rows[0];

      await appendCrudAudit(
        client,
        authUser.uuid,
        "dispatch.intransit_issue_created",
        {
          resource_type: "dispatch.intransit_issues",
          resource_id: inserted.id,
          load_id: body.load_id,
          driver_id: driver.id,
          type: body.type,
          severity: body.severity,
        },
        body.severity === "info" ? "info" : "warning",
        "WF-048"
      );

      if (body.severity === "critical") {
        await client.query(
          `
            INSERT INTO outbox.outbox_queue (aggregate_type, aggregate_id, event_type, payload)
            VALUES ($1, $2, $3, $4::jsonb)
          `,
          [
            "dispatch.intransit_issues",
            inserted.id,
            "dispatch.intransit_issue.critical",
            JSON.stringify({
              issue_id: inserted.id,
              load_id: body.load_id,
              notify_channels: ["sms", "email"],
              notify_targets: ["owner", "manager", "safety"],
            }),
          ]
        );
      }

      return { kind: "ok" as const, id: inserted.id, created_at: inserted.created_at };
    });

    if (result.kind !== "ok") {
      return reply.code(result.code).send({ error: result.error });
    }
    return reply.code(201).send({ id: result.id, created_at: result.created_at });
  });
}
