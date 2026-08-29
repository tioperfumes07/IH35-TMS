import type { FastifyInstance, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { assertCompanyMembership } from "../../_helpers/company-membership-guard.js";
import { withCurrentUser } from "../../auth/db.js";
import { companyQuerySchema, currentAuthUser, validationError } from "../shared.js";
import { SettlementPostingError } from "./settlement-posting.math.js";
import { SettlementBillPaymentError } from "./settlement-bill-payment.math.js";
import {
  postSettlementBillPayment,
} from "./settlement-bill-payment-posting.service.js";
import { chargeRecoverFromDriverExpense } from "./recover-from-driver.service.js";
import { getDriverBucketBalances } from "./bucket-ledger.service.js";
import { EscrowResolverError } from "../../driver-finance/escrow-resolver.service.js";

const financeRoles = new Set(["Owner", "Administrator", "Manager", "Accountant"]);

// =====================================================================================================
// SET-01 (2026-07-26) — RETIRE the FIN-18 single-JE settlement poster HTTP entry.
// postSettlementToGl mis-routes escrow / cash-advance to generic {type}_recovery buckets.
// Canonical path: POST /api/v1/driver-finance/settlements/:id/payrun-close → closeSettlementPayRun
// (per-driver escrow LIABILITY + advance_recovery ASSET). Mirror payroll settlement 308 retirement.
// Do NOT call postSettlementToGl from this route. Service retained for tests / void helpers only.
// Guard: scripts/verify-no-deprecated-settlement-poster-mounted.mjs
// =====================================================================================================

const CANONICAL_SETTLEMENTS = "/api/v1/driver-finance/settlements";

function retiredSettlementPost(reply: FastifyReply, settlementId?: string) {
  const canonical = settlementId
    ? `${CANONICAL_SETTLEMENTS}/${settlementId}/payrun-close`
    : CANONICAL_SETTLEMENTS;
  reply.header("location", canonical);
  return reply.code(308).send({
    error: "gone",
    message:
      "FIN-18 POST /api/v1/accounting/settlement-posting/post is retired. Use the canonical payrun-close path (per-driver escrow liability + cash-advance asset).",
    canonical_endpoint: canonical,
  });
}

// ACCT-F5648 — the FIN-18 forward-posting route above was retired via SET-01 (2026-07-26), but this
// reverse route was left live and genuinely callable, reversing a poster whose forward counterpart no
// settlement in prod ever actually used (confirmed via Neon: 0 rows match the
// ih35:settlement-gl:v1:%:initial_post idempotency-key pattern). Worse, reverseSettlementGlPosting
// never flips driver_settlements.status the way the canonical void/cancel executor
// (governance/void-cancel-executors.ts's executeDriverSettlement) does — so even in the unreachable
// case where a stale settlement_id somehow hit this route, it would leave the settlement in an
// inconsistent state (GL reversed, status untouched). Retired the same way the /post route was, per
// SET-01's own directive ("Service retained for tests / void helpers only") — pointing callers at the
// canonical, already-hardened governance void/cancel request flow instead.
const CANONICAL_VOID_CANCEL_REQUESTS = "/api/v1/governance/void-cancel-requests";

function retiredSettlementReverse(reply: FastifyReply) {
  reply.header("location", CANONICAL_VOID_CANCEL_REQUESTS);
  return reply.code(308).send({
    error: "gone",
    message:
      "FIN-18 POST /api/v1/accounting/settlement-posting/reverse is retired (its forward counterpart was retired in SET-01 and no settlement in prod was ever posted through it). Use the canonical governance void/cancel request flow to reverse a posted driver settlement.",
    canonical_endpoint: CANONICAL_VOID_CANCEL_REQUESTS,
  });
}

function ensureFinanceUser(req: Parameters<typeof currentAuthUser>[0], reply: Parameters<typeof currentAuthUser>[1]) {
  const user = currentAuthUser(req, reply);
  if (!user) return null;
  if (!financeRoles.has(String(user.role ?? ""))) {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return user as { uuid: string; role: string };
}

function mapError(error: SettlementPostingError) {
  const byCode: Record<string, number> = {
    SETTLEMENT_NOT_FOUND: 404,
    SETTLEMENT_NOT_POSTABLE: 409,
    CONSENT_MISSING: 422,
    NET_PAY_FLOOR_BREACH: 422,
    ACCOUNT_ROLE_BINDING_MISSING: 422,
    SETTLEMENT_TOTALS_INCONSISTENT: 422,
    UNBALANCED_ENTRY: 422,
  };
  return { statusCode: byCode[error.code] ?? 400, body: { error: error.code, message: error.message, details: error.details ?? null } };
}

function mapBillPaymentError(error: SettlementBillPaymentError) {
  const byCode: Record<string, number> = {
    SETTLEMENT_NOT_FOUND: 404,
    SETTLEMENT_NOT_POSTABLE: 409,
    DRIVER_VENDOR_MISSING: 422,
    NO_LOAD_BILLS: 422,
    DRIVER_PAY_ACCOUNT_MISSING: 422,
    AP_ACCOUNT_MISSING: 422,
    DIP_BANK_MISSING: 422,
    DRIVER_ADVANCE_ACCOUNT_MISSING: 422,
    DRIVER_ESCROW_ACCOUNT_MISSING: 422,
    DEDUCTION_RECOVERY_ACCOUNT_MISSING: 422,
    SOURCE_POSTING_LINK_MISSING: 422,
    SETTLEMENT_TOTALS_INCONSISTENT: 422,
    UNBALANCED_ENTRY: 422,
    // ACCT-F5697 — the other settlement poster already claimed this settlement; a real conflict, not
    // a malformed request.
    SETTLEMENT_ALREADY_POSTED_BY_OTHER_POSTER: 409,
  };
  return { statusCode: byCode[error.code] ?? 400, body: { error: error.code, message: error.message, details: error.details ?? null } };
}

function mapBillPaymentRouteError(reply: FastifyReply, error: unknown) {
  if (error instanceof SettlementBillPaymentError) {
    const mapped = mapBillPaymentError(error);
    return reply.code(mapped.statusCode).send(mapped.body);
  }
  if (error instanceof EscrowResolverError) {
    return reply.code(409).send({ error: error.code, message: error.message, details: error.details ?? null });
  }
  throw error;
}

const postBody = z.object({
  settlement_id: z.string().uuid(),
  floor_override: z.object({ authorized_by_user_id: z.string().uuid(), reason: z.string().trim().min(1) }).optional().nullable(),
});
const billPaymentPostBody = z.object({ settlement_id: z.string().uuid() });
const recoverBody = z.object({ expense_id: z.string().uuid() });
const driverBucketsQuery = companyQuerySchema.extend({ driver_id: z.string().uuid() });

export async function registerSettlementPostingRoutes(app: FastifyInstance) {
  // RETIRED (SET-01) — never posts via FIN-18; 308 to canonical payrun-close.
  app.post("/api/v1/accounting/settlement-posting/post", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const body = postBody.safeParse(req.body ?? {});
    const settlementId = body.success ? body.data.settlement_id : undefined;
    return retiredSettlementPost(reply, settlementId);
  });

  // SET-04 — canonical Bill+BillPayment forward poster (blueprint §3). Role-gated; SETTLEMENT_GL_POSTING_ENABLED
  // is enforced inside postSettlementBillPayment (OFF => skipped_flag_off, zero writes). Reuses the existing
  // poster only — no new GL math.
  app.post("/api/v1/accounting/settlement-posting/bill-payment-post", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = ensureFinanceUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);
    const body = billPaymentPostBody.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    try {
      const result = await postSettlementBillPayment(
        {
          operatingCompanyId: query.data.operating_company_id,
          settlementId: body.data.settlement_id,
        },
        { userId: user.uuid }
      );
      return reply.code(result.result === "posted" ? 201 : 200).send(result);
    } catch (error) {
      return mapBillPaymentRouteError(reply, error);
    }
  });

  // ACCT-F5648 — retired (SET-01 companion retirement). See retiredSettlementReverse above.
  app.post("/api/v1/accounting/settlement-posting/reverse", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = ensureFinanceUser(req, reply);
    if (!user) return;
    return retiredSettlementReverse(reply);
  });

  // Recover-from-driver: charge a flagged expense into the driver's deduction bucket (consent-gated).
  app.post("/api/v1/accounting/settlement-posting/recover-from-driver", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = ensureFinanceUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);
    const body = recoverBody.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    try {
      const result = await chargeRecoverFromDriverExpense(
        { operatingCompanyId: query.data.operating_company_id, expenseId: body.data.expense_id },
        { userId: user.uuid }
      );
      return reply.code(201).send(result);
    } catch (error) {
      if (error instanceof SettlementPostingError) {
        const m = mapError(error);
        return reply.code(m.statusCode).send(m.body);
      }
      throw error;
    }
  });

  // READ-ONLY per-bucket balances for a driver (the PWA "Advance balance / Lease N of M" view).
  app.get("/api/v1/accounting/settlement-posting/driver-buckets", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = ensureFinanceUser(req, reply);
    if (!user) return;
    const query = driverBucketsQuery.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);
    const buckets = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [query.data.operating_company_id]);
      return getDriverBucketBalances(client as never, {
        operatingCompanyId: query.data.operating_company_id,
        driverId: query.data.driver_id,
      });
    });
    return reply.code(200).send({ driver_id: query.data.driver_id, buckets });
  });
}

export default fp(async (app) => {
  await registerSettlementPostingRoutes(app);
}, { name: "accounting.registerSettlementPostingRoutes" });
