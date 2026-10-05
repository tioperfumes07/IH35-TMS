import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { resolveRoleAccountOptional } from "./coa-roles/resolver.service.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import {
  AccountRegisterInlineSaveError,
  AccountRegisterToggleError,
  getAccountRegister,
  saveAccountRegisterInline,
  toggleAccountRegisterCleared,
} from "./account-register.service.js";

const accountRegisterQuerySchema = companyQuerySchema.extend({
  account_id: z.string().uuid("account_id must be a uuid"),
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "from_date must be YYYY-MM-DD"),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "to_date must be YYYY-MM-DD"),
  search: z.string().max(200).optional(),
  type: z.string().max(64).optional(),
  // ACCT-F410 — the register now answers in the basis it is asked for. Default accrual
  // (@decision Q7: "Basis defaults to accrual (frontend default, no per-user memory)"), so every
  // existing caller keeps the exact payload it gets today.
  basis: z.enum(["accrual", "cash"]).optional(),
});

const toggleClearedBodySchema = companyQuerySchema.extend({
  posting_id: z.string().uuid("posting_id must be a uuid"),
  cleared: z.boolean(),
});

const inlineSaveBodySchema = companyQuerySchema.extend({
  posting_id: z.string().uuid("posting_id must be a uuid"),
  memo: z.string().max(2000).nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  requires_original_document: z.boolean().optional(),
});

function canAccessAccountRegister(role: string): boolean {
  return role === "Owner" || role === "Administrator" || role === "Manager" || role === "Accountant";
}

async function registerAccountRegisterRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/account-register", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessAccountRegister(String(user.role ?? ""))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const query = accountRegisterQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    try {
      // withCompanyScope asserts membership + sets RLS context before opening the scoped connection.
      const report = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
        // ACCT-F410 — resolve the COA roles HERE, the same way trial-balance.routes.ts and
        // balance-sheet.routes.ts resolve them, and hand them to the service. The register must
        // not answer from a different role mapping than the report the owner clicked from, and
        // resolving in the service would be a second lookup free to drift from theirs.
        // Only for cash: accrual needs no classification and should pay for no extra queries.
        const roleMatches =
          query.data.basis === "cash"
            ? {
                arControlAccountId: await resolveRoleAccountOptional(
                  client,
                  query.data.operating_company_id,
                  "ar_control"
                ),
                apControlAccountId: await resolveRoleAccountOptional(
                  client,
                  query.data.operating_company_id,
                  "ap_control"
                ),
              }
            : null;
        return getAccountRegister(client, {
          operating_company_id: query.data.operating_company_id,
          account_id: query.data.account_id,
          from_date: query.data.from_date,
          to_date: query.data.to_date,
          search: query.data.search ?? null,
          type: query.data.type ?? null,
          basis: query.data.basis ?? null,
          roleMatches,
        });
      });
      return reply.code(200).send(report);
    } catch (error) {
      if (String((error as Error)?.message) === "account_not_found") {
        return reply.code(404).send({ error: "account_not_found" });
      }
      throw error;
    }
  });

  // B-1b — ✓ blank↔C. R locked; bank-match C refuses blank (unmatch first).
  app.post(
    "/api/v1/accounting/account-register/toggle-cleared",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      if (!canAccessAccountRegister(String(user.role ?? ""))) {
        return reply.code(403).send({ error: "forbidden" });
      }
      const body = toggleClearedBodySchema.safeParse(req.body ?? {});
      if (!body.success) return validationError(reply, body.error);

      try {
        const result = await withCompanyScope(user.uuid, body.data.operating_company_id, (client) =>
          toggleAccountRegisterCleared(client, {
            operating_company_id: body.data.operating_company_id,
            posting_id: body.data.posting_id,
            cleared: body.data.cleared,
            actor_user_id: user.uuid,
          })
        );
        return reply.code(200).send(result);
      } catch (error) {
        if (error instanceof AccountRegisterToggleError) {
          return reply.code(error.httpStatus).send({ error: error.code });
        }
        throw error;
      }
    }
  );

  // B-1c — inline Save (memo + location). Date/payee/amount/account → open_original_document.
  app.post(
    "/api/v1/accounting/account-register/inline-save",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      if (!canAccessAccountRegister(String(user.role ?? ""))) {
        return reply.code(403).send({ error: "forbidden" });
      }
      const body = inlineSaveBodySchema.safeParse(req.body ?? {});
      if (!body.success) return validationError(reply, body.error);

      try {
        const result = await withCompanyScope(user.uuid, body.data.operating_company_id, (client) =>
          saveAccountRegisterInline(client, {
            operating_company_id: body.data.operating_company_id,
            posting_id: body.data.posting_id,
            memo: body.data.memo,
            location: body.data.location,
            requires_original_document: body.data.requires_original_document === true,
            actor_user_id: user.uuid,
          })
        );
        return reply.code(200).send(result);
      } catch (error) {
        if (error instanceof AccountRegisterInlineSaveError) {
          return reply.code(error.httpStatus).send({ error: error.code });
        }
        throw error;
      }
    }
  );
}

export default fp(registerAccountRegisterRoutes, {
  name: "accounting.registerAccountRegisterRoutes",
});
