// ACCT-F11104 — GET the QuickBooks bill-payment evidence proposal for open USMCA bills. READ-ONLY:
// bill -> QBO bill -> QBO payment -> app bank line, grouped exact_unique / ambiguous / no_qbo_payment /
// pre_cutover_flagged, with a `postable` flag per row. Nothing is applied here; applying a row is the
// owner's action through the existing bill-payment and bank-match engine.
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { companyQuerySchema, currentAuthUser, validationError } from "./shared.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { QboEvidenceScopeError, getQboBillPaymentEvidence } from "./qbo-bill-payment-evidence.service.js";

function ownerOrAdmin(role: string) {
  return role === "Owner" || role === "Administrator";
}

export async function registerQboBillPaymentEvidenceRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/accounting/ap/qbo-bill-payment-evidence",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      if (!ownerOrAdmin(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden_owner_only" });
      const query = companyQuerySchema.safeParse(req.query ?? {});
      if (!query.success) return validationError(reply, query.error);
      await assertCompanyMembership(user.uuid, query.data.operating_company_id);
      try {
        const proposal = await getQboBillPaymentEvidence({
          userId: user.uuid,
          operating_company_id: query.data.operating_company_id,
        });
        return reply.code(200).send(proposal);
      } catch (error) {
        if (error instanceof QboEvidenceScopeError) return reply.code(400).send({ error: error.code, message: error.message });
        throw error;
      }
    }
  );
}

export default fp(async (app) => {
  await registerQboBillPaymentEvidenceRoutes(app);
}, { name: "accounting.registerQboBillPaymentEvidenceRoutes" });
