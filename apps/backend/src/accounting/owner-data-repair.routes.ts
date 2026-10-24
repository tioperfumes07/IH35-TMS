/**
 * owner-data-repair.routes.ts — LEAD 443.260.5 (b) / OWNER RULING 443.261 (CC-2): production data repairs run from the
 * app under the OWNER's session — never a seat holding a raw writer credential (Lead 443.237 (b), 1:50 PM "the owner has
 * no writer credential to run scripts. Make it an engine API route").
 *
 * Each route: Owner only · dry_run defaults to true and writes nothing · a real run refuses unless its AUTH-<NNN> on main
 * is OPEN and unexpired · idempotent (a rerun does nothing) · the full result JSON is returned. The work is THE same
 * service the ops script calls, so the fork rehearsal is the route's rehearsal.
 *   POST /api/v1/fuel/statement-discounts/card-credit-repair            AUTH-453 (B: batches of 25, $0.00 / TB 0 per tx;
 *        max_batches per call, default 4 — the API sits behind Cloudflare's 100 s origin timeout, so the owner repeats the
 *        call until live_statement_discount_jes_left = 0; every batch commits on its own, so even a cut-off call is safe)
 *   POST /api/v1/driver-finance/settlements/header-boundaries-repair    AUTH-454 (the 5 stale headers, metadata only)
 *   POST /api/v1/accounting/expense-families/align-repair               AUTH-457 (OWNER RULING 443.288-A: statement card
 *        differences left on a load their receipt no longer belongs to follow the receipt through THE family engine)
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withLuciaBypass } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { assertOwnerAuthorizationOpen, OwnerAuthorizationError } from "../lib/owner-authorization-runtime.js";
import { CardCreditRepairRefused, runStatementCardCreditRepair, type RunInTx } from "../fuel/statement-card-credit-repair.service.js";
import { repairStaleSettlementHeadersInClientTx, SettlementHeaderRepairRefused } from "../driver-finance/settlement-header-repair.service.js";
import { alignExpenseFamiliesInClientTx, ExpenseFamilyAlignRefused } from "./expense-family-align-repair.service.js";

const body = z.object({
  operating_company_id: z.string().uuid(),
  dry_run: z.boolean().default(true),
});
const cardCreditBody = body.extend({ max_batches: z.number().int().min(1).max(10).default(4) });

function ownerOnly(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  const user = req.user;
  if (!user || String(user.role ?? "") !== "Owner") {
    reply.code(403).send({ error: "owner_only", detail: "a production data repair runs only under the owner's session" });
    return null;
  }
  return user;
}

function refused(reply: FastifyReply, e: unknown) {
  if (e instanceof OwnerAuthorizationError) return reply.code(409).send({ error: "owner_authorization_not_open", auth_id: e.authId, detail: e.reason });
  if (e instanceof CardCreditRepairRefused || e instanceof SettlementHeaderRepairRefused || e instanceof ExpenseFamilyAlignRefused) {
    return reply.code(409).send({ error: "repair_refused_rolled_back", detail: e.message });
  }
  throw e;
}

export async function registerOwnerDataRepairRoutes(app: FastifyInstance) {
  app.post("/api/v1/fuel/statement-discounts/card-credit-repair", { config: { rateLimit: { max: 3, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = ownerOnly(req, reply);
    if (!user) return reply;
    const parsed = cardCreditBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const b = parsed.data;
    await assertCompanyMembership(user.uuid, b.operating_company_id);
    try {
      if (!b.dry_run) assertOwnerAuthorizationOpen("AUTH-453");
      const runInTx: RunInTx = (fn) => withLuciaBypass(async (client) => {
        await client.query("SET LOCAL lock_timeout = '5s'");
        await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [b.operating_company_id]);
        return fn(client as never);
      }, { actorUserId: user.uuid });
      const result = await runStatementCardCreditRepair(runInTx, { companyId: b.operating_company_id, actorUserId: user.uuid, dryRun: b.dry_run, maxBatches: b.max_batches });
      if (!b.dry_run) {
        await withLuciaBypass((client) => appendCrudAudit(client as never, user.uuid, "accounting.statement_card_credit_repair.run", {
          owner_auth_id: "AUTH-453", operating_company_id: b.operating_company_id, batches: result.batches.length,
          documents: result.documents_this_run, cents: result.cents_this_run, left: result.live_statement_discount_jes_left, tb: result.tb,
        }, "info", "443.260.5"), { actorUserId: user.uuid });
      }
      return result;
    } catch (e) {
      // The repair ran in its own transaction (rolled back on throw); log it, then answer 409 by name or rethrow.
      req.log.warn({ err: e, route: req.url }, "owner data repair refused or failed");
      return refused(reply, e);
    }
  });

  app.post("/api/v1/driver-finance/settlements/header-boundaries-repair", { config: { rateLimit: { max: 3, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = ownerOnly(req, reply);
    if (!user) return reply;
    const parsed = body.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const b = parsed.data;
    await assertCompanyMembership(user.uuid, b.operating_company_id);
    try {
      if (!b.dry_run) assertOwnerAuthorizationOpen("AUTH-454");
      return await withLuciaBypass(async (client) => {
        await client.query("SET LOCAL lock_timeout = '5s'");
        await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [b.operating_company_id]);
        return repairStaleSettlementHeadersInClientTx(client as never, { companyId: b.operating_company_id, actorUserId: user.uuid, dryRun: b.dry_run, expect: 5 });
      }, { actorUserId: user.uuid });
    } catch (e) {
      // The repair ran in its own transaction (rolled back on throw); log it, then answer 409 by name or rethrow.
      req.log.warn({ err: e, route: req.url }, "owner data repair refused or failed");
      return refused(reply, e);
    }
  });
  app.post("/api/v1/accounting/expense-families/align-repair", { config: { rateLimit: { max: 3, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = ownerOnly(req, reply);
    if (!user) return reply;
    const parsed = body.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const b = parsed.data;
    await assertCompanyMembership(user.uuid, b.operating_company_id);
    try {
      if (!b.dry_run) assertOwnerAuthorizationOpen("AUTH-457");
      return await withLuciaBypass(async (client) => {
        await client.query("SET LOCAL lock_timeout = '5s'");
        await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [b.operating_company_id]);
        const result = await alignExpenseFamiliesInClientTx(client as never, { companyId: b.operating_company_id, actorUserId: user.uuid, dryRun: b.dry_run });
        if (!b.dry_run) {
          await appendCrudAudit(client as never, user.uuid, "accounting.expense_family_align_repair.run", {
            owner_auth_id: "AUTH-457", operating_company_id: b.operating_company_id, children_moved: result.children_moved,
            cents: result.cents_moved, left: result.misplaced_left, tb: result.tb_after,
          }, "info", "443.288-A");
        }
        return result;
      }, { actorUserId: user.uuid });
    } catch (e) {
      // The repair ran in its own transaction (rolled back on throw); log it, then answer 409 by name or rethrow.
      req.log.warn({ err: e, route: req.url }, "owner data repair refused or failed");
      return refused(reply, e);
    }
  });
}
