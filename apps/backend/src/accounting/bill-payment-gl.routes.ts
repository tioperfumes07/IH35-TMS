// CHAIN-04 — bill-payment -> GL post route (TRANSPORTATION ONLY). Gated by
// BILL_PAYMENT_GL_POSTING_ENABLED (default OFF). OFF -> 409; ON -> posts the balanced
// DR ap_control / CR real-bank JE through the SAME canonical writer (postSourceTransaction ->
// buildBillPaymentLines) — no new GL math. Mirrors CHAIN-03's /bills/:id/post-gl. Tier-1 financial;
// the flag stays OFF until Jorge flips it per-entity after the A/P tie-out reconciliation.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError } from "./shared.js";
import { TRANSP_OPERATING_COMPANY_ID } from "./bill-gl-draft.service.js";
import { postSourceTransaction, PostingEngineError } from "./posting-engine.service.js";
import {
  BILL_PAYMENT_GL_POSTING_FLAG_KEY,
  isBillPaymentGlPostingEnabled,
} from "./bill-payment-gl.service.js";

export async function registerBillPaymentGlRoutes(app: FastifyInstance) {
  app.post("/api/v1/accounting/bill-payments/:id/post-gl", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!["Owner", "Administrator"].includes(user.role)) {
      return reply.code(403).send({ error: "forbidden", message: "Owner/Administrator only" });
    }

    const params = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    // SCOPE LOCK — TRANSPORTATION ONLY (Jorge: finish TRANSP, then clone for TRK + USMCA).
    if (query.data.operating_company_id !== TRANSP_OPERATING_COMPANY_ID) {
      return reply.code(400).send({
        error: "transp_only",
        message: "CHAIN-04 is TRANSPORTATION-only. TRK and USMCA are cloned in a later step.",
      });
    }

    const postingEnabled = await isBillPaymentGlPostingEnabled(query.data.operating_company_id, String(user.uuid));
    if (!postingEnabled) {
      return reply.code(409).send({
        error: "posting_disabled",
        message: `Bill-payment→GL posting is disabled for this entity (${BILL_PAYMENT_GL_POSTING_FLAG_KEY} per-entity override OFF). Enable the per-entity override on a Neon branch to verify.`,
      });
    }

    try {
      const result = await postSourceTransaction(
        {
          operating_company_id: query.data.operating_company_id,
          source_transaction_type: "bill_payment",
          source_transaction_id: params.data.id,
        },
        { userId: user.uuid }
      );
      return { step: "CHAIN-04-post", posting_enabled: true, result };
    } catch (err) {
      // Named, deliberate fail-loud failures from the engine (bill-A/P-not-posted guard, fail-closed
      // account resolution, period lock, ineligible payment) -> 422 with the code. Never a silent post.
      if (err instanceof PostingEngineError) {
        return reply.code(422).send({ error: "post_failed", code: err.code, message: err.message });
      }
      throw err;
    }
  });
}
