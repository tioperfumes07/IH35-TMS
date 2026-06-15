/**
 * FH-2 Loan Wizard routes — PREVIEW ONLY (Tier 3). Gated behind FINANCE_HUB_LOAN_WIZARD_ENABLED.
 * This module performs ZERO ledger writes: it validates inputs, checks the flag, and returns the
 * computed preview (loan/asset/amortization/depreciation + a balanced opening JE) as data.
 * Posting is a DEFERRED, separate Tier-1 PR behind this same flag (full GUARD ceremony).
 */
import type { FastifyInstance } from "fastify";
import { currentAuthUser, withCompanyScope } from "../../accounting/shared.js";
import { isEnabled } from "../../lib/feature-flags/service.js";
import {
  buildLoanWizardPreview,
  loanWizardPreviewInputSchema,
  LoanWizardValidationError,
} from "./preview.service.js";

export const FINANCE_HUB_LOAN_WIZARD_FLAG_KEY = "FINANCE_HUB_LOAN_WIZARD_ENABLED";

export async function registerFinanceLoanWizardRoutes(app: FastifyInstance) {
  // Preview-first: compute the full draft set without writing anything.
  app.post("/api/v1/finance/loan-wizard/preview", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const parsed = loanWizardPreviewInputSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    }
    const input = parsed.data;

    return withCompanyScope(user.uuid, input.operating_company_id, async (client) => {
      const enabled = await isEnabled(client, FINANCE_HUB_LOAN_WIZARD_FLAG_KEY, {
        operating_company_id: input.operating_company_id,
        user_uuid: String(user.uuid),
      });
      if (!enabled) {
        return reply.code(404).send({ error: "feature_disabled", flag: FINANCE_HUB_LOAN_WIZARD_FLAG_KEY });
      }
      try {
        const preview = buildLoanWizardPreview(input);
        return { preview };
      } catch (e) {
        if (e instanceof LoanWizardValidationError) {
          return reply.code(422).send({ error: "unbalanced_preview", message: e.message });
        }
        throw e;
      }
    });
  });
}
