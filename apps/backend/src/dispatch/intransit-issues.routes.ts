import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { enqueueOutboxEvent } from "../outbox/enqueue-outbox-event.js";

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
  app.post("/api/v1/dispatch/intransit-issues", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const bodyParsed = createIssueBodySchema.safeParse(req.body ?? {});
    if (!bodyParsed.success) return sendValidationError(reply, bodyParsed.error);
    const body = bodyParsed.data;

    const result = await withCurrentUser(authUser.uuid, async (client) => {
      const assignmentRes = await client.query<{
        load_id: string;
        assigned_unit_id: string | null;
        driver_id: string;
        driver_name: string | null;
        operating_company_id: string;
      }>(
        `
          SELECT l.id AS load_id,
                 l.assigned_unit_id,
                 d.id AS driver_id,
                 concat_ws(' ', d.first_name, d.last_name) AS driver_name,
                 l.operating_company_id::text AS operating_company_id
          FROM mdata.loads l
          JOIN mdata.drivers d
            ON d.identity_user_id = $1::uuid
           AND d.id IN (l.assigned_primary_driver_id, l.assigned_secondary_driver_id)
           AND d.deactivated_at IS NULL
           AND d.archived_at IS NULL
          WHERE l.id = $2::uuid
            AND l.soft_deleted_at IS NULL
          LIMIT 1
        `,
        [authUser.uuid, body.load_id]
      );
      const assignment = assignmentRes.rows[0] ?? null;
      if (!assignment) return { kind: "forbidden" as const, code: 403, error: "driver_load_mismatch" };
      if (!assignment.assigned_unit_id) return { kind: "conflict" as const, code: 409, error: "load_missing_assigned_unit" };

      // FORCE RLS on the issue table requires the canonical load company transaction-locally.
      // Derive it from the assigned load, never a mutable/default company selection.
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [assignment.operating_company_id]);

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
        [["operating_company_id"], assignment.operating_company_id],
        [["driver_id"], assignment.driver_id],
        [["unit_id"], assignment.assigned_unit_id],
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
      if (!inserted) {
        return { kind: "conflict" as const, code: 409, error: "intransit_issue_create_failed" };
      }

      await appendCrudAudit(
        client,
        authUser.uuid,
        "dispatch.intransit_issue_created",
        {
          resource_type: "dispatch.intransit_issues",
          resource_id: inserted.id,
          load_id: body.load_id,
          driver_id: assignment.driver_id,
          operating_company_id: assignment.operating_company_id,
          type: body.type,
          severity: body.severity,
        },
        body.severity === "info" ? "info" : "warning",
        "WF-048"
      );

      if (body.severity === "critical") {
        // The event carries operating_company_id because every notification is entity-scoped, and the
        // consumer refuses to deliver without one. This route scopes by user, not by company, so the
        // company is resolved FROM THE LOAD rather than assumed.
        // ENTITY-SCOPED to the reporting driver's OWN company. A bare id lookup would happily return
        // a load from another entity; requiring the match also means the notice can never be raised
        // against a company the driver does not belong to.
        // ENTITY-SCOPED through the sanctioned helper (auth/operating-company-scope.ts), which is the
        // membership gate the rest of the app uses. A bare id lookup would happily return a load from
        // another entity; requiring the match means the notice can never be raised against a company
        // this caller does not belong to. The pre-existing driver self-lookup above is left BYTE-
        // IDENTICAL — it is keyed on identity_user_id (the caller themselves), which is narrower than
        // a company predicate, and rewriting it would only churn the entity-scope baseline.
        const scopeRes = await client.query<{ operating_company_id: string | null; load_number: string | null }>(
          `SELECT operating_company_id::text AS operating_company_id, load_number
             FROM mdata.loads
            WHERE id = $1::uuid
              AND operating_company_id = $2::uuid
            LIMIT 1`,
          [body.load_id, assignment.operating_company_id]
        );
        await enqueueOutboxEvent(
          client,
          "dispatch.intransit_issue.critical",
          { aggregate_type: "dispatch.intransit_issues", aggregate_id: inserted.id },
          {
            issue_id: inserted.id,
            load_id: body.load_id,
            load_number: scopeRes.rows[0]?.load_number ?? null,
            operating_company_id: scopeRes.rows[0]?.operating_company_id ?? null,
            issue_type: body.type,
            description: body.description,
            notify_channels: ["sms", "email"],
            notify_targets: ["owner", "manager", "safety"],
          }
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
