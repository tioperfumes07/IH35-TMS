// [HOLD-FOR-JORGE — TIER 1] governance.void_cancel_requests — maker/checker REST API.
//
// Generic, reusable request->approve workflow for ALL void/cancel surfaces (Jorge-locked 2026-06-29):
//   - ANY authenticated user may FILE a request (entity_type, entity_id, action, reason >= 3).
//   - EXECUTORS (Owner|Administrator|Accountant, canVoidCancel) approve/deny.
//   - Self-approval is blocked (cannot_decide_own_request); decisions take a FOR UPDATE lock and require
//     the row to still be 'pending'.
//   - On APPROVE, the underlying void/cancel is executed through the entity dispatch map
//     (void-cancel-executors.ts) on the SAME transaction so the reversal + the decision are atomic.
//   - reason is REQUIRED on the request; decision_reason is REQUIRED on deny.
// Modelled on identity.workflow-routes.ts. Tenant-scoped via withCompanyScope (app.operating_company_id).

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCompanyScope } from "../accounting/shared.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { canVoidCancel, VOID_REQUIRES_REQUEST_ERROR } from "../lib/authz/void-cancel-authz.js";
import { executeVoidCancel, isVoidCancelEntitySupported } from "./void-cancel-executors.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import {
  buildClosedPeriodFlag,
  buildQboVoidMirror,
  reasonEntityMatches,
  validateReasonNote,
  VOID_QBO_MIRROR_FLAG_KEY,
} from "./void-cancel-reason-linkage.js";

const createBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  entity_type: z.string().trim().min(1).max(80),
  entity_id: z.string().trim().min(1).max(200),
  action: z.enum(["void", "cancel"]),
  reason: z.string().trim().min(3, "a reason is required").max(1000),
  // Task #24: controlled reason from catalogs.void_cancel_reasons + optional note. The DB trigger
  // (202606300030) enforces same-entity + note-required; validated here first for a clean 400.
  reason_code_id: z.string().uuid().optional(),
  note_text: z.string().trim().max(1000).optional(),
});

const listQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  status: z.enum(["pending", "approved", "denied"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const idParamSchema = z.object({ id: z.string().uuid() });

const approveBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  decision_reason: z.string().trim().max(1000).optional(),
});

const denyBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  decision_reason: z.string().trim().min(3, "a reason is required").max(1000),
});

type TenantClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

type RequestRow = {
  id: string;
  operating_company_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  reason: string;
  status: string;
  requested_by_user_id: string;
  requested_at: string;
  decided_by_user_id: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  reversing_entry_ref: string | null;
  reason_code_id: string | null;
  note_text: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const SELECT_COLS = `
  id::text, operating_company_id::text, entity_type, entity_id, action, reason, status,
  requested_by_user_id::text, requested_at::text, decided_by_user_id::text, decided_at::text,
  decision_reason, reversing_entry_ref, reason_code_id::text, note_text, is_active,
  created_at::text, updated_at::text
`;

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function badRequest(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

export async function registerVoidCancelRequestRoutes(app: FastifyInstance) {
  // FILE a request — any authenticated user.
  app.post("/api/v1/governance/void-cancel-requests", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const body = createBodySchema.safeParse(req.body ?? {});
    if (!body.success) return badRequest(reply, body.error);
    const d = body.data;

    const outcome = await withCompanyScope(user.uuid, d.operating_company_id, async (client: TenantClient) => {
      // If a controlled catalog reason is supplied, pre-validate same-entity + note-required for a clean
      // 400 (the DB trigger trg_void_cancel_request_reason_check is the final net).
      if (d.reason_code_id) {
        const reasonRes = await client.query<{ requires_note: boolean; operating_company_id: string }>(
          `SELECT requires_note, operating_company_id::text AS operating_company_id
             FROM catalogs.void_cancel_reasons WHERE id = $1::uuid LIMIT 1`,
          [d.reason_code_id]
        );
        const reason = reasonRes.rows[0];
        if (!reason) return { validation: { error: "reason_not_found", message: "The chosen reason does not exist for this entity." } };
        if (!reasonEntityMatches(reason.operating_company_id, d.operating_company_id)) {
          return { validation: { error: "reason_cross_entity", message: "The chosen reason belongs to a different entity." } };
        }
        const noteCheck = validateReasonNote(reason.requires_note, d.note_text);
        if (!noteCheck.ok) return { validation: { error: noteCheck.error, message: noteCheck.message } };
      }

      const inserted = await client.query<RequestRow>(
        `INSERT INTO governance.void_cancel_requests
           (operating_company_id, entity_type, entity_id, action, reason, requested_by_user_id, reason_code_id, note_text)
         VALUES ($1::uuid, $2, $3, $4, $5, $6::uuid, $7::uuid, $8)
         RETURNING ${SELECT_COLS}`,
        [d.operating_company_id, d.entity_type, d.entity_id, d.action, d.reason, user.uuid, d.reason_code_id ?? null, d.note_text ?? null]
      );
      const created = inserted.rows[0];
      await appendCrudAudit(
        client,
        user.uuid,
        "governance.void_cancel_request.filed",
        {
          resource_type: "governance.void_cancel_requests",
          resource_id: created.id,
          operating_company_id: d.operating_company_id,
          entity_type: d.entity_type,
          entity_id: d.entity_id,
          action: d.action,
          reason: d.reason,
        },
        "info",
        "VOID-CANCEL-GOV"
      );
      return { created };
    }).catch((err: unknown) => {
      // Final net: the DB trigger enforces note-required + same-entity. Map its errors to a clean 400.
      const code = (err as { code?: string }).code;
      if (code === "23514" || code === "23503") {
        return { validation: { error: "reason_constraint_violation", message: "The chosen reason is invalid or requires a note." } };
      }
      throw err;
    });

    if ("validation" in outcome && outcome.validation) {
      return reply.code(400).send({ error: outcome.validation.error, message: outcome.validation.message });
    }
    const created = "created" in outcome ? outcome.created : undefined;
    if (!created) return reply.code(500).send({ error: "request_create_failed" });
    return reply.code(201).send({ request: created, entity_supported: isVoidCancelEntitySupported(d.entity_type) });
  });

  // LIST — executors see all; requesters see their own.
  app.get("/api/v1/governance/void-cancel-requests", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const q = listQuerySchema.safeParse(req.query ?? {});
    if (!q.success) return badRequest(reply, q.error);
    const d = q.data;
    const isExecutor = canVoidCancel(String(user.role ?? ""));

    const rows = await withCompanyScope(user.uuid, d.operating_company_id, async (client: TenantClient) => {
      const values: unknown[] = [d.operating_company_id];
      const filters = [`operating_company_id = $1::uuid`];
      if (d.status) {
        values.push(d.status);
        filters.push(`status = $${values.length}`);
      }
      if (!isExecutor) {
        // Requesters only see their own requests.
        values.push(user.uuid);
        filters.push(`requested_by_user_id = $${values.length}::uuid`);
      }
      values.push(d.limit);
      const limPos = values.length;
      values.push(d.offset);
      const offPos = values.length;
      const res = await client.query<RequestRow>(
        `SELECT ${SELECT_COLS}
           FROM governance.void_cancel_requests
          WHERE ${filters.join(" AND ")}
          ORDER BY requested_at DESC
          LIMIT $${limPos} OFFSET $${offPos}`,
        values
      );
      return res.rows;
    });

    return { requests: rows, is_executor: isExecutor };
  });

  // APPROVE — executors only; self-approval blocked; executes the underlying void/cancel atomically.
  app.post("/api/v1/governance/void-cancel-requests/:id/approve", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!canVoidCancel(String(user.role ?? ""))) return reply.code(403).send(VOID_REQUIRES_REQUEST_ERROR);
    const params = idParamSchema.safeParse(req.params ?? {});
    if (!params.success) return badRequest(reply, params.error);
    const body = approveBodySchema.safeParse(req.body ?? {});
    if (!body.success) return badRequest(reply, body.error);
    const d = body.data;

    const result = await withCompanyScope(user.uuid, d.operating_company_id, async (client: TenantClient) => {
      const reqRes = await client.query<RequestRow>(
        `SELECT ${SELECT_COLS}
           FROM governance.void_cancel_requests
          WHERE id = $1::uuid AND operating_company_id = $2::uuid
          FOR UPDATE`,
        [params.data.id, d.operating_company_id]
      );
      const request = reqRes.rows[0];
      if (!request) return { error: "request_not_found" as const };
      if (request.status !== "pending") return { error: "request_not_pending" as const };
      if (request.requested_by_user_id === user.uuid) return { error: "cannot_decide_own_request" as const };

      // Execute the underlying void/cancel via the dispatch map (atomic with the decision).
      const exec = await executeVoidCancel(request.entity_type, {
        client,
        operatingCompanyId: d.operating_company_id,
        entityId: request.entity_id,
        action: request.action as "void" | "cancel",
        userId: user.uuid,
        reason: request.reason,
      });
      if (exec.kind !== "ok") return { exec_error: exec.kind };

      // Task #24 step 5/6: the void executed. The TMS→QBO mirror is gated OFF (writes nothing; the register
      // shows QBO guidance). The closed-period flag tells the register the original touched a closed period
      // (the reversal already dated into the open period inside void.service).
      const qboMirrorEnabled = await isEnabled(client, VOID_QBO_MIRROR_FLAG_KEY, {
        operating_company_id: d.operating_company_id,
      });
      const qboMirror = buildQboVoidMirror(qboMirrorEnabled);
      const closedPeriod = buildClosedPeriodFlag(Boolean(exec.closed_period_reversal));

      const updated = await client.query<RequestRow>(
        `UPDATE governance.void_cancel_requests
            SET status = 'approved',
                decided_by_user_id = $2::uuid,
                decided_at = now(),
                decision_reason = $3,
                reversing_entry_ref = COALESCE($4, reversing_entry_ref)
          WHERE id = $1::uuid
          RETURNING ${SELECT_COLS}`,
        [request.id, user.uuid, d.decision_reason ?? null, exec.reversing_entry_ref]
      );
      await appendCrudAudit(
        client,
        user.uuid,
        "governance.void_cancel_request.approved",
        {
          resource_type: "governance.void_cancel_requests",
          resource_id: request.id,
          operating_company_id: d.operating_company_id,
          entity_type: request.entity_type,
          entity_id: request.entity_id,
          action: request.action,
          reversing_entry_ref: exec.reversing_entry_ref,
          decided_by_user_id: user.uuid,
          decision_reason: d.decision_reason ?? null,
        },
        "warning",
        "VOID-CANCEL-GOV"
      );
      return { row: updated.rows[0], qbo_mirror: qboMirror, closed_period: closedPeriod };
    });

    if ("error" in result) {
      if (result.error === "request_not_found") return reply.code(404).send({ error: result.error });
      if (result.error === "cannot_decide_own_request") return reply.code(403).send({ error: result.error });
      return reply.code(409).send({ error: result.error });
    }
    if ("exec_error" in result) {
      const map: Record<string, { code: number; error: string; message: string }> = {
        unsupported_entity: { code: 422, error: "entity_not_wired", message: "This entity type is not yet wired for governed void/cancel execution." },
        not_found: { code: 404, error: "target_entity_not_found", message: "The target entity no longer exists." },
        already_done: { code: 409, error: "target_already_void_or_cancelled", message: "The target entity is already voided/cancelled." },
        not_completable: { code: 409, error: "target_not_voidable", message: "This target cannot be voided/cancelled in its current state (e.g. a completed work order or a paid invoice)." },
        financial_blocked: { code: 409, error: "target_has_posted_financial_entries", message: "Target has posted financial entries; financial void is disabled for this entity (posting flag off)." },
        bill_has_payments: { code: 409, error: "target_linked_bill_has_payments", message: "Target has live payments; void the payment first." },
      };
      const key = String(result.exec_error);
      const m = map[key] ?? { code: 409, error: key, message: "Void/cancel execution failed." };
      return reply.code(m.code).send({ error: m.error, message: m.message });
    }
    return { request: result.row, qbo_mirror: result.qbo_mirror, closed_period: result.closed_period };
  });

  // DENY — executors only; decision_reason required.
  app.post("/api/v1/governance/void-cancel-requests/:id/deny", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!canVoidCancel(String(user.role ?? ""))) return reply.code(403).send(VOID_REQUIRES_REQUEST_ERROR);
    const params = idParamSchema.safeParse(req.params ?? {});
    if (!params.success) return badRequest(reply, params.error);
    const body = denyBodySchema.safeParse(req.body ?? {});
    if (!body.success) return badRequest(reply, body.error);
    const d = body.data;

    const result = await withCompanyScope(user.uuid, d.operating_company_id, async (client: TenantClient) => {
      const reqRes = await client.query<RequestRow>(
        `SELECT ${SELECT_COLS}
           FROM governance.void_cancel_requests
          WHERE id = $1::uuid AND operating_company_id = $2::uuid
          FOR UPDATE`,
        [params.data.id, d.operating_company_id]
      );
      const request = reqRes.rows[0];
      if (!request) return { error: "request_not_found" as const };
      if (request.status !== "pending") return { error: "request_not_pending" as const };
      if (request.requested_by_user_id === user.uuid) return { error: "cannot_decide_own_request" as const };

      const updated = await client.query<RequestRow>(
        `UPDATE governance.void_cancel_requests
            SET status = 'denied',
                decided_by_user_id = $2::uuid,
                decided_at = now(),
                decision_reason = $3
          WHERE id = $1::uuid
          RETURNING ${SELECT_COLS}`,
        [request.id, user.uuid, d.decision_reason]
      );
      await appendCrudAudit(
        client,
        user.uuid,
        "governance.void_cancel_request.denied",
        {
          resource_type: "governance.void_cancel_requests",
          resource_id: request.id,
          operating_company_id: d.operating_company_id,
          entity_type: request.entity_type,
          entity_id: request.entity_id,
          action: request.action,
          decided_by_user_id: user.uuid,
          decision_reason: d.decision_reason,
        },
        "warning",
        "VOID-CANCEL-GOV"
      );
      return { row: updated.rows[0] };
    });

    if ("error" in result) {
      if (result.error === "request_not_found") return reply.code(404).send({ error: result.error });
      if (result.error === "cannot_decide_own_request") return reply.code(403).send({ error: result.error });
      return reply.code(409).send({ error: result.error });
    }
    return { request: result.row };
  });
}
