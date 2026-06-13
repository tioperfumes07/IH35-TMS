import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { requireDriverSession } from "../driver/auth.js";
import {
  approveCashAdvanceRequest,
  cancelMyCashAdvanceRequest,
  createCashAdvanceRequest,
  denyCashAdvanceRequest,
  driverCreateCashAdvanceRequestSchema,
  getCashAdvanceRequestDetail,
  listCashAdvanceRequests,
  listMyCashAdvanceRequests,
  listPendingCashAdvanceRequests,
  officeApproveBodySchema,
  officeDenyBodySchema,
} from "./cash-advance-requests.service.js";
import { escalateCashAdvanceRequestToOwner, listPendingOwnerApprovalCashAdvanceRequests, sendOwnerEscalationEmails } from "./cash-advance-owner-approval.service.js";
import { emitDriverRequestViewedOnce } from "./driver-request-spine-emit.js";
import { disburseDriverAdvanceCore } from "../cash-advances/cash-advance-disburse.js";
import { notifyOwnersCashAdvanceSubmitted } from "../notifications/dispatcher.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const listQuerySchema = companyQuerySchema.extend({
  status: z
    .enum(["pending", "under_review", "approved", "denied", "expired", "cancelled_by_driver"])
    .optional(),
});

const uuidParamsSchema = z.object({
  id: z.string().uuid(),
});

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function currentUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function canReviewCashAdvanceRequest(role: string): boolean {
  return ["Owner", "Administrator", "Manager", "Accountant", "Dispatcher"].includes(role);
}

function canEscalateCashAdvanceToOwner(role: string): boolean {
  return ["Owner", "Administrator", "Manager"].includes(role);
}

async function fetchDriverOperatingCompanyId(userUuid: string, driverId: string): Promise<string | null> {
  return withCurrentUser(userUuid, async (client) => {
    const r = await client.query(`SELECT operating_company_id::text AS oc FROM mdata.drivers WHERE id = $1 LIMIT 1`, [driverId]);
    return (r.rows[0]?.oc as string) ?? null;
  });
}

export async function registerCashAdvanceRequestRoutes(app: FastifyInstance) {
  app.get("/api/v1/driver/cash-advance-requests", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const d = req.driver!;
    const oc = await fetchDriverOperatingCompanyId(req.user!.uuid, d.id);
    if (!oc) return reply.code(403).send({ error: "driver_company_not_found" });
    const rows = await withCurrentUser(req.user!.uuid, async (client) => {
      await client.query(`SET LOCAL app.operating_company_id = '${oc}'`);
      return listMyCashAdvanceRequests(client, oc, d.id);
    });
    return { requests: rows };
  });

  app.post("/api/v1/driver/cash-advance-requests", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const parsed = driverCreateCashAdvanceRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    const d = req.driver!;
    const oc = await fetchDriverOperatingCompanyId(req.user!.uuid, d.id);
    if (!oc) return reply.code(403).send({ error: "driver_company_not_found" });
    const result = await withCurrentUser(req.user!.uuid, async (client) => {
      await client.query(`SET LOCAL app.operating_company_id = '${oc}'`);
      return createCashAdvanceRequest(client, {
        operatingCompanyId: oc,
        driverId: d.id,
        actorUserId: req.user!.uuid,
        body: parsed.data,
      });
    });
    void notifyOwnersCashAdvanceSubmitted({
      operatingCompanyId: oc,
      request: result.request as Record<string, unknown>,
      actorUserId: req.user!.uuid,
    }).catch(() => undefined);
    return reply.code(201).send(result);
  });

  app.post("/api/v1/driver/cash-advance-requests/:id/cancel", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const parsedParams = uuidParamsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const d = req.driver!;
    const oc = await fetchDriverOperatingCompanyId(req.user!.uuid, d.id);
    if (!oc) return reply.code(403).send({ error: "driver_company_not_found" });
    const row = await withCurrentUser(req.user!.uuid, async (client) => {
      await client.query(`SET LOCAL app.operating_company_id = '${oc}'`);
      return cancelMyCashAdvanceRequest(client, {
        operatingCompanyId: oc,
        driverId: d.id,
        requestId: parsedParams.data.id,
        actorUserId: req.user!.uuid,
      });
    });
    if (!row) return reply.code(409).send({ error: "cash_advance_request_not_cancellable" });
    return { request: row };
  });

  app.get("/api/v1/driver-finance/cash-advance-requests/pending", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    if (!canReviewCashAdvanceRequest(String(user.role ?? ""))) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    const rows = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SET LOCAL app.operating_company_id = '${parsed.data.operating_company_id}'`);
      return listPendingCashAdvanceRequests(client, parsed.data.operating_company_id);
    });
    return { requests: rows };
  });

  app.get("/api/v1/driver-finance/cash-advance-requests", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    if (!canReviewCashAdvanceRequest(String(user.role ?? ""))) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    const rows = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SET LOCAL app.operating_company_id = '${parsed.data.operating_company_id}'`);
      return listCashAdvanceRequests(client, parsed.data.operating_company_id, {
        status: parsed.data.status,
      });
    });
    return { requests: rows };
  });

  app.get("/api/v1/driver-finance/cash-advance-requests/pending-owner-approval", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    if (String(user.role ?? "") !== "Owner") {
      return reply.code(403).send({ error: "forbidden" });
    }
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    const rows = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SET LOCAL app.operating_company_id = '${parsed.data.operating_company_id}'`);
      return listPendingOwnerApprovalCashAdvanceRequests(client, parsed.data.operating_company_id);
    });
    return { requests: rows };
  });

  app.post("/api/v1/driver-finance/cash-advance-requests/:id/escalate", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    if (!canEscalateCashAdvanceToOwner(String(user.role ?? ""))) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const parsedParams = uuidParamsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const esc = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SET LOCAL app.operating_company_id = '${parsedQuery.data.operating_company_id}'`);
      return escalateCashAdvanceRequestToOwner(client, {
        operatingCompanyId: parsedQuery.data.operating_company_id,
        requestId: parsedParams.data.id,
        actorUserId: user.uuid,
      });
    });

    if ("error" in esc) {
      const err = esc.error;
      if (err === "not_found") return reply.code(404).send({ error: err });
      return reply.code(409).send({ error: err });
    }

    const driverName = String(esc.request.driver_name ?? "");
    const amt = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(
      Number(esc.request.requested_amount_cents ?? 0) / 100
    );
    void sendOwnerEscalationEmails({
      owner_approval_url: esc.owner_approval_url,
      requestDisplayId: String(esc.request.display_id ?? ""),
      requestedAmountDollars: amt,
      driverName,
    });

    return {
      owner_approval_url: esc.owner_approval_url,
      request: esc.request,
    };
  });

  app.get("/api/v1/driver-finance/cash-advance-requests/:id", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    if (!canReviewCashAdvanceRequest(String(user.role ?? ""))) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const parsedParams = uuidParamsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);
    const detail = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SET LOCAL app.operating_company_id = '${parsedQuery.data.operating_company_id}'`);
      const d = await getCashAdvanceRequestDetail(client, parsedQuery.data.operating_company_id, parsedParams.data.id);
      // B4: record the FIRST office view of this request (accountability response-time signal).
      // Only office reviewers reach here (canReviewCashAdvanceRequest gate above); idempotent.
      if (d) {
        await emitDriverRequestViewedOnce(client, {
          operating_company_id: parsedQuery.data.operating_company_id,
          request_id: parsedParams.data.id,
          request_type: "cash_advance",
          source_table: "driver_finance.cash_advance_requests",
          actor_type: "user",
          actor_user_id: user.uuid,
          actor_role: String(user.role ?? "") || null,
        });
      }
      return d;
    });
    if (!detail) return reply.code(404).send({ error: "not_found" });
    return detail;
  });

  app.post("/api/v1/driver-finance/cash-advance-requests/:id/approve", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    if (!canReviewCashAdvanceRequest(String(user.role ?? ""))) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const parsedParams = uuidParamsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);
    const parsedBody = officeApproveBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    const result = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SET LOCAL app.operating_company_id = '${parsedQuery.data.operating_company_id}'`);
      return approveCashAdvanceRequest(client, {
        operatingCompanyId: parsedQuery.data.operating_company_id,
        requestId: parsedParams.data.id,
        actorUserId: user.uuid,
        actorRole: String(user.role ?? "") || undefined,
        body: parsedBody.data,
      });
    });

    if ("error" in result) {
      if (result.error === "not_found") return reply.code(404).send({ error: result.error });
      if (result.error === "advance_create_failed") {
        return reply.code(400).send({ error: result.error, details: result.details });
      }
      return reply.code(409).send({ error: result.error });
    }

    // B5: the approve tx has committed (advance created + linked + status='approved' +
    // settlement deduction + B4 'approved' emit). Now disburse + post via B3 (Dr QBO-149 /
    // Cr cash) on a separate, idempotent tx — this also fires the B4 'posted' timeline emit.
    // Back-dating posting_date is role-gated to Owner/Administrator inside disburse.
    const disbursement = await disburseDriverAdvanceCore(
      user.uuid,
      String(user.role ?? ""),
      parsedQuery.data.operating_company_id,
      {
        advance_id: result.advanceId,
        posting_date: parsedBody.data.posting_date ?? null,
        credit_account_id: parsedBody.data.credit_account_id ?? null,
      }
    );
    if (!disbursement.ok && disbursement.code === 403) {
      return reply.code(403).send({ error: "posting_date_requires_owner_admin" });
    }

    return {
      request: result.request,
      advance: result.advance,
      cascade_branch: result.cascadeBranch,
      linked_driver_bill_id: result.linkedDriverBillId,
      disbursement,
    };
  });

  app.post("/api/v1/driver-finance/cash-advance-requests/:id/deny", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    if (!canReviewCashAdvanceRequest(String(user.role ?? ""))) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const parsedParams = uuidParamsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);
    const parsedBody = officeDenyBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    const result = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SET LOCAL app.operating_company_id = '${parsedQuery.data.operating_company_id}'`);
      return denyCashAdvanceRequest(client, {
        operatingCompanyId: parsedQuery.data.operating_company_id,
        requestId: parsedParams.data.id,
        actorUserId: user.uuid,
        actorRole: String(user.role ?? "") || undefined,
        body: parsedBody.data,
      });
    });

    if ("error" in result) {
      const code = result.error === "not_found" ? 404 : 409;
      return reply.code(code).send({ error: result.error });
    }
    return { request: result.request };
  });
}
