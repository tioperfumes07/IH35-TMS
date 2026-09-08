import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { appendCrudAudit } from "../audit/crud-audit.js";

// NEW-29/30/31 (owner 2026-09-08, verbatim): "every reefer load must confirm lumper receipts sent;
// dispatch flow must ask on reefer loads whether there's a lumper, who's paying, and if a customer
// is paying, whether that customer gets invoiced too, all confirmed by a click; if a driver is
// late, the app must always ask whether there's a penalty."
//
// This is a DISPATCH-side click-confirm prompt, deliberately separate from Book Load (Cursor's
// lane — lumper_required/lumper_paid_by are captured there at booking time) and from the read-only
// Stops Record tab (load-stops-record.routes.ts: "There is no write path here — every field is
// edited in the Book Load wizard §C"). The NEW state this file owns (receipts sent / invoice-the-
// customer-too / late-penalty decision) is captured post-booking, at dispatch/delivery time, and
// does not exist as a column anywhere yet — CC-2 cannot author migrations (verify-migration-lane-
// band.mjs hard-bars cc-2/-prefixed branches from db/migrations/*.sql), so it is recorded the same
// durable, append-only way dispatch/arrival-prompts.routes.ts already records driver arrival
// confirm/dismiss: a real row in audit.audit_events, keyed by event_class + payload.resource_id,
// read back by "most recent wins". No schema change, nothing invented.
//
// Billing hook: `accounting.expense_lines.billable_customer_uuid` (Lumper Lifecycle scenario 2,
// currently gated OFF behind LUMPER_LIFECYCLE_ENABLED, CC-1/AP-owned files under
// apps/backend/src/cash-advances/lumper-*.ts) is the natural consumer of the
// dispatch.lumper_customer_invoice_requested event this route emits, and driver-finance internal
// fines are the natural consumer of dispatch.late_penalty_decision when penalty=true. Per the
// owner's explicit instruction this file only EMITS those decisions — it does not write into either
// CC-1-owned table. Flagged to CC-1 via docs/audit/GUARD-WORKORDERS.md rather than reaching in.

const paramsSchema = z.object({ loadId: z.string().uuid() });
const querySchema = z.object({ operating_company_id: z.string().uuid() });

const lumperBodySchema = z.object({
  receipts_sent: z.boolean().optional(),
  invoice_customer: z.boolean().optional(),
});

const latePenaltyBodySchema = z.object({
  penalty: z.boolean(),
  note: z.string().trim().max(500).optional(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user as { uuid: string } | null;
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
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [operatingCompanyId]);
    return fn(client);
  });
}

// Mirrors CargoTempBadge.tsx's isReeferCommodity() exactly — canonical predicate, not reinvented.
const REEFER_COMMODITY_SQL = `(lower(coalesce(l.commodity, '')) LIKE '%reefer%' OR lower(coalesce(l.commodity, '')) LIKE '%refrigerat%')`;

type LatestAuditFlag = { flag: boolean | null; decided_at: string | null; note: string | null };

async function latestAuditFlag(
  client: { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> },
  operatingCompanyId: string,
  loadId: string,
  eventClass: string
): Promise<LatestAuditFlag> {
  const res = await client.query<{ payload: Record<string, unknown>; created_at: string }>(
    `
      SELECT payload, created_at::text
      FROM audit.audit_events
      WHERE event_class = $1
        AND payload->>'resource_id' = $2
        AND payload->>'operating_company_id' = $3
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [eventClass, loadId, operatingCompanyId]
  );
  const row = res.rows[0];
  if (!row) return { flag: null, decided_at: null, note: null };
  const p = row.payload ?? {};
  return {
    flag: typeof p.flag === "boolean" ? p.flag : null,
    decided_at: row.created_at,
    note: typeof p.note === "string" ? p.note : null,
  };
}

export async function registerDispatchCompletionPromptsRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/dispatch/loads/:loadId/completion-prompts",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = authed(req, reply);
      if (!user) return;

      const params = paramsSchema.safeParse(req.params ?? {});
      if (!params.success) return sendValidationError(reply, params.error);
      const query = querySchema.safeParse(req.query ?? {});
      if (!query.success) return sendValidationError(reply, query.error);

      const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
        const loadRes = await client.query<{
          id: string;
          is_reefer: boolean;
        }>(
          `
            SELECT l.id::text, ${REEFER_COMMODITY_SQL} AS is_reefer
            FROM mdata.loads l
            WHERE l.id = $1::uuid
              AND l.operating_company_id = $2::uuid
              AND l.soft_deleted_at IS NULL
            LIMIT 1
          `,
          [params.data.loadId, query.data.operating_company_id]
        );
        const load = loadRes.rows[0];
        if (!load) return null;

        const lumperStopsRes = await client.query<{
          stop_id: string;
          lumper_required: boolean;
          lumper_paid_by: string;
        }>(
          `
            SELECT ls.id::text AS stop_id, ls.lumper_required, ls.lumper_paid_by::text
            FROM mdata.load_stops ls
            WHERE ls.load_id = $1::uuid
              AND ls.soft_deleted_at IS NULL
              AND ls.lumper_required = true
            ORDER BY ls.sequence_number ASC
          `,
          [params.data.loadId]
        );

        const lateStopsRes = await client.query<{
          stop_id: string;
          stop_type: string;
          sequence_number: number;
          minutes_late: string;
        }>(
          `
            SELECT
              ls.id::text AS stop_id,
              ls.stop_type::text,
              ls.sequence_number,
              round(EXTRACT(EPOCH FROM (ls.actual_arrival_at - COALESCE(ls.appointment_end_at, ls.scheduled_arrival_at))) / 60)::text AS minutes_late
            FROM mdata.load_stops ls
            WHERE ls.load_id = $1::uuid
              AND ls.soft_deleted_at IS NULL
              AND ls.actual_arrival_at IS NOT NULL
              AND COALESCE(ls.appointment_end_at, ls.scheduled_arrival_at) IS NOT NULL
              AND ls.actual_arrival_at > COALESCE(ls.appointment_end_at, ls.scheduled_arrival_at)
            ORDER BY ls.sequence_number ASC
          `,
          [params.data.loadId]
        );

        const receiptsSent = await latestAuditFlag(
          client,
          query.data.operating_company_id,
          params.data.loadId,
          "dispatch.lumper_receipts_sent"
        );
        const invoiceCustomer = await latestAuditFlag(
          client,
          query.data.operating_company_id,
          params.data.loadId,
          "dispatch.lumper_customer_invoice_requested"
        );
        const latePenalty = await latestAuditFlag(
          client,
          query.data.operating_company_id,
          params.data.loadId,
          "dispatch.late_penalty_decision"
        );

        return {
          is_reefer: load.is_reefer,
          has_lumper: lumperStopsRes.rows.length > 0,
          lumper_paid_by: lumperStopsRes.rows.find((r) => r.lumper_paid_by !== "unknown")?.lumper_paid_by ?? null,
          lumper_receipts_sent: receiptsSent.flag,
          lumper_receipts_sent_at: receiptsSent.decided_at,
          invoice_customer_for_lumper: invoiceCustomer.flag,
          late_stops: lateStopsRes.rows.map((r) => ({
            stop_id: r.stop_id,
            stop_type: r.stop_type,
            sequence: r.sequence_number,
            minutes_late: Number(r.minutes_late),
          })),
          late_penalty_decided: latePenalty.flag,
          late_penalty_decided_at: latePenalty.decided_at,
          late_penalty_note: latePenalty.note,
        };
      });

      if (!result) return reply.code(404).send({ error: "load_not_found" });
      return result;
    }
  );

  app.post(
    "/api/v1/dispatch/loads/:loadId/completion-prompts/lumper",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = authed(req, reply);
      if (!user) return;

      const params = paramsSchema.safeParse(req.params ?? {});
      if (!params.success) return sendValidationError(reply, params.error);
      const query = querySchema.safeParse(req.query ?? {});
      if (!query.success) return sendValidationError(reply, query.error);
      const body = lumperBodySchema.safeParse(req.body ?? {});
      if (!body.success) return sendValidationError(reply, body.error);
      if (body.data.receipts_sent === undefined && body.data.invoice_customer === undefined) {
        return reply.code(400).send({ error: "validation_error", details: "receipts_sent or invoice_customer required" });
      }

      const ok = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
        const loadRes = await client.query<{ id: string }>(
          `SELECT id FROM mdata.loads WHERE id = $1::uuid AND operating_company_id = $2::uuid AND soft_deleted_at IS NULL LIMIT 1`,
          [params.data.loadId, query.data.operating_company_id]
        );
        if (!loadRes.rows[0]) return false;

        if (body.data.receipts_sent !== undefined) {
          await appendCrudAudit(
            client,
            user.uuid,
            "dispatch.lumper_receipts_sent",
            {
              resource_type: "mdata.loads",
              resource_id: params.data.loadId,
              operating_company_id: query.data.operating_company_id,
              flag: body.data.receipts_sent,
            },
            "info",
            "NEW-29-DISPATCH-LUMPER"
          );
        }
        if (body.data.invoice_customer !== undefined) {
          await appendCrudAudit(
            client,
            user.uuid,
            "dispatch.lumper_customer_invoice_requested",
            {
              resource_type: "mdata.loads",
              resource_id: params.data.loadId,
              operating_company_id: query.data.operating_company_id,
              flag: body.data.invoice_customer,
            },
            "info",
            "NEW-29-DISPATCH-LUMPER"
          );
        }
        return true;
      });

      if (!ok) return reply.code(404).send({ error: "load_not_found" });
      return { ok: true };
    }
  );

  app.post(
    "/api/v1/dispatch/loads/:loadId/completion-prompts/late-penalty",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = authed(req, reply);
      if (!user) return;

      const params = paramsSchema.safeParse(req.params ?? {});
      if (!params.success) return sendValidationError(reply, params.error);
      const query = querySchema.safeParse(req.query ?? {});
      if (!query.success) return sendValidationError(reply, query.error);
      const body = latePenaltyBodySchema.safeParse(req.body ?? {});
      if (!body.success) return sendValidationError(reply, body.error);

      const ok = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
        const loadRes = await client.query<{ id: string }>(
          `SELECT id FROM mdata.loads WHERE id = $1::uuid AND operating_company_id = $2::uuid AND soft_deleted_at IS NULL LIMIT 1`,
          [params.data.loadId, query.data.operating_company_id]
        );
        if (!loadRes.rows[0]) return false;

        await appendCrudAudit(
          client,
          user.uuid,
          "dispatch.late_penalty_decision",
          {
            resource_type: "mdata.loads",
            resource_id: params.data.loadId,
            operating_company_id: query.data.operating_company_id,
            flag: body.data.penalty,
            note: body.data.note ?? null,
          },
          "info",
          "NEW-31-DISPATCH-LATE-PENALTY"
        );
        return true;
      });

      if (!ok) return reply.code(404).send({ error: "load_not_found" });
      return { ok: true };
    }
  );
}
