import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

type QueryableClient = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

type ReturningDetectionInput = {
  curp?: string | null;
  cdl_number?: string | null;
  cdl_state?: string | null;
};

const safetyReadableRoles = new Set(["Owner", "Administrator", "Manager", "Safety"]);

const checkReturningBodySchema = z
  .object({
    curp: z.string().trim().max(18).optional(),
    cdl_number: z.string().trim().max(100).optional(),
    cdl_state: z.string().trim().max(50).optional(),
  })
  .superRefine((value, ctx) => {
    const hasCurp = Boolean(value.curp);
    const hasCdlPair = Boolean(value.cdl_number && value.cdl_state);
    if (!hasCurp && !hasCdlPair) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide curp or cdl_number+cdl_state",
      });
    }
  });

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function canReadSafetyFile(role: string): boolean {
  return safetyReadableRoles.has(role);
}

function normalizeCurp(value?: string | null): string | null {
  const normalized = value?.trim().toUpperCase();
  return normalized ? normalized : null;
}

function normalizeCdlNumber(value?: string | null): string | null {
  const normalized = value?.trim().toUpperCase();
  return normalized ? normalized : null;
}

function normalizeCdlState(value?: string | null): string | null {
  const normalized = value?.trim().toUpperCase();
  return normalized ? normalized : null;
}

export async function findReturningDriverMatches(client: QueryableClient, input: ReturningDetectionInput) {
  const curp = normalizeCurp(input.curp);
  const cdlNumber = normalizeCdlNumber(input.cdl_number);
  const cdlState = normalizeCdlState(input.cdl_state);
  const filters: string[] = [];
  const values: unknown[] = [];

  if (curp) {
    values.push(curp);
    filters.push(`upper(trim(e.curp_snapshot)) = $${values.length}`);
  }
  if (cdlNumber && cdlState) {
    values.push(cdlNumber);
    values.push(cdlState);
    filters.push(`(upper(trim(e.cdl_number_snapshot)) = $${values.length - 1} AND upper(trim(e.cdl_state_snapshot)) = $${values.length})`);
  }

  if (filters.length === 0) {
    return {
      returning_driver: false,
      matched_events: [],
      severity_summary: { severe_count: 0, warning_count: 0, info_count: 0 },
    };
  }

  const query = `
    SELECT
      e.id AS event_id,
      e.event_type,
      e.event_date,
      e.severity,
      e.summary,
      e.details,
      e.created_at,
      e.voided_at,
      e.void_reason,
      d.id AS matched_driver_id,
      d.first_name,
      d.last_name,
      d.curp AS matched_driver_curp,
      d.status AS matched_driver_status,
      tr.code AS termination_reason_code,
      tr.label AS termination_reason_label,
      tr.severity AS termination_reason_severity
    FROM mdata.driver_safety_events e
    INNER JOIN mdata.drivers d ON d.id = e.driver_id
    LEFT JOIN catalogs.driver_termination_reasons tr ON tr.id = e.termination_reason_id
    WHERE ${filters.map((f) => `(${f})`).join(" OR ")}
    ORDER BY e.event_date DESC, e.created_at DESC
  `;
  const result = await client.query(query, values);
  const matchedEvents = result.rows.map((row) => ({
    event_id: String(row.event_id),
    event_type: String(row.event_type),
    event_date: String(row.event_date),
    severity: String(row.severity),
    summary: String(row.summary),
    termination_reason:
      row.termination_reason_code && row.termination_reason_label
        ? {
            code: String(row.termination_reason_code),
            label: String(row.termination_reason_label),
            severity: String(row.termination_reason_severity ?? row.severity),
          }
        : null,
    voided: Boolean(row.voided_at),
    matched_driver_id: String(row.matched_driver_id),
    matched_driver_name: `${String(row.first_name)} ${String(row.last_name)}`.trim(),
    matched_driver_curp: row.matched_driver_curp ? String(row.matched_driver_curp) : null,
    matched_driver_status: row.matched_driver_status ? String(row.matched_driver_status) : null,
  }));

  const severitySummary = matchedEvents.reduce(
    (acc, event) => {
      if (event.severity === "severe") acc.severe_count += 1;
      else if (event.severity === "warning") acc.warning_count += 1;
      else acc.info_count += 1;
      return acc;
    },
    { severe_count: 0, warning_count: 0, info_count: 0 }
  );

  return {
    returning_driver: matchedEvents.length > 0,
    matched_events: matchedEvents,
    severity_summary: severitySummary,
  };
}

export async function registerDriverReturningDetectionRoutes(app: FastifyInstance) {
  app.post("/api/v1/mdata/drivers/check-returning", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!canReadSafetyFile(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsedBody = checkReturningBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    const response = await withCurrentUser(authUser.uuid, async (client) => {
      const detection = await findReturningDriverMatches(client, parsedBody.data);
      if (detection.returning_driver) {
        await appendCrudAudit(
          client,
          authUser.uuid,
          "mdata.drivers.returning_driver_detected",
          {
            resource_type: "mdata.drivers",
            match_count: detection.matched_events.length,
            severity_summary: detection.severity_summary,
            matched_events: detection.matched_events,
          },
          detection.severity_summary.severe_count > 0 ? "warning" : "info",
          "BT-1-DRIVER-SAFETY-FILE"
        );
      }
      return detection;
    });

    return response;
  });
}
