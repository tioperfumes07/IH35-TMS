/**
 * Company Settlement OPEN + human-confirmed CLOSE — M.3 (STANDING-DIRECTIVES-2026-09-05.md §CC-1).
 *
 * POST /api/v1/accounting/company-settlements/open — "open = pre-settlement (many loads, one
 * number, start/end)": given a period, find-or-create the company_settlements header and link every
 * driver settlement sharing that exact period. Same write roles as driver settlement create.
 *
 * PATCH /api/v1/accounting/company-settlements/:id/close — human-confirmed close (requires
 * confirm=true in the body). Owner/Accountant only (same gate as every other financial void/close
 * action in this codebase, void.service.ts's canVoid). Posts NO new journal entry — verifies every
 * linked driver settlement's real GL posting already exists (driver_finance.
 * driver_settlement_gl_bills -> accounting.journal_entries, the canonical poster's own output) and
 * fails closed, naming exactly which driver settlements are not yet posted, otherwise.
 */
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { openOrGetCompanySettlementForPeriod } from "./company-settlement-open.service.js";
import { closeCompanySettlementManual, CompanySettlementCloseError } from "./company-settlement-close-manual.service.js";
import { canVoid } from "./void.service.js";

const openBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const closeParamsSchema = z.object({ id: z.string().uuid() });
const closeBodySchema = z.object({ confirm: z.boolean() });

// Same write-role set settlements.routes.ts's SETTLEMENT_WRITE_ROLES uses for driver settlement
// create/acknowledge/finalize -- a company settlement is the same domain's rollup.
function canOpenCompanySettlement(role: string) {
  return ["Owner", "Administrator", "Manager", "Accountant", "Payroll"].includes(role);
}

export async function registerCompanySettlementOpenCloseRoutes(app: FastifyInstance) {
  app.post(
    "/api/v1/accounting/company-settlements/open",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      if (!canOpenCompanySettlement(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

      const body = openBodySchema.safeParse(req.body ?? {});
      if (!body.success) return validationError(reply, body.error);
      if (body.data.period_start > body.data.period_end) {
        return reply.code(400).send({ error: "validation_error", details: { period: ["period_start must be on or before period_end"] } });
      }
      await assertCompanyMembership(user.uuid, body.data.operating_company_id);

      const result = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) =>
        openOrGetCompanySettlementForPeriod(client, {
          operatingCompanyId: body.data.operating_company_id,
          periodStart: body.data.period_start,
          periodEnd: body.data.period_end,
          actorUserId: user.uuid,
        })
      );

      return reply.code(200).send(result);
    }
  );

  app.patch(
    "/api/v1/accounting/company-settlements/:id/close",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      if (!canVoid(String(user.role ?? ""))) {
        return reply.code(403).send({ error: "forbidden", detail: "company settlement close requires Owner or Accountant" });
      }

      const params = closeParamsSchema.safeParse(req.params ?? {});
      if (!params.success) return validationError(reply, params.error);
      const query = companyQuerySchema.safeParse(req.query ?? {});
      if (!query.success) return validationError(reply, query.error);
      const body = closeBodySchema.safeParse(req.body ?? {});
      if (!body.success) return validationError(reply, body.error);
      await assertCompanyMembership(user.uuid, query.data.operating_company_id);

      try {
        const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) =>
          closeCompanySettlementManual(client, {
            operatingCompanyId: query.data.operating_company_id,
            companySettlementId: params.data.id,
            actorUserId: user.uuid,
            confirm: body.data.confirm,
          })
        );
        return reply.code(200).send(result);
      } catch (error) {
        if (error instanceof CompanySettlementCloseError) {
          const status = error.code === "company_settlement_not_found" ? 404 : error.code === "confirmation_required" ? 400 : 409;
          return reply.code(status).send({ error: error.code, detail: error.message, ...error.details });
        }
        throw error;
      }
    }
  );
}

export default fp(async (app) => {
  await registerCompanySettlementOpenCloseRoutes(app);
}, { name: "accounting.registerCompanySettlementOpenCloseRoutes" });
