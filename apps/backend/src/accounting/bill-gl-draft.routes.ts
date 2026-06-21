// CHAIN-03 STEP-1 — read-only DRAFT-JE preview endpoint (TRANSPORTATION ONLY).
//
//   POST /api/v1/accounting/bills/draft-je-preview
//
// Computes the journal entry a sample/real TRANSP bill WOULD post and returns it as a balanced
// DRAFT. WRITES NOTHING. Owner/Administrator only. Entity-locked to TRANSP (clone for TRK/USMCA
// later). The real post path (STEP-2) is gated by BILL_GL_POSTING_ENABLED (default OFF) and is NOT
// wired here — this endpoint never posts regardless of the flag.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { EXPENSE_CATEGORY_MAP_KIND_VALUES } from "./expense-category-map/resolver.service.js";
import {
  BillGlDraftError,
  TRANSP_OPERATING_COMPANY_ID,
  computeBillGlDraft,
} from "./bill-gl-draft.service.js";

// STEP-2 posting gate (default OFF). STEP-1 reports it so GUARD/Jorge can see posting is disabled;
// this endpoint is draft-only and never posts even when the flag is on.
const BILL_GL_POSTING_ENABLED = process.env.BILL_GL_POSTING_ENABLED === "true";

const draftLineSchema = z.object({
  category_kind: z.enum(EXPENSE_CATEGORY_MAP_KIND_VALUES).nullish(),
  category_code: z.string().trim().max(120).nullish(),
  amount_cents: z.coerce.number().int().positive(),
  description: z.string().trim().max(500).nullish(),
});

const draftPreviewBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  bill_label: z.string().trim().max(200).nullish(),
  posting_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  lines: z.array(draftLineSchema).min(1).max(200),
});

export async function registerBillGlDraftRoutes(app: FastifyInstance) {
  app.post("/api/v1/accounting/bills/draft-je-preview", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!["Owner", "Administrator"].includes(user.role)) {
      return reply.code(403).send({ error: "forbidden", message: "Owner/Administrator only" });
    }

    const parsed = draftPreviewBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const body = parsed.data;

    // SCOPE LOCK — TRANSPORTATION ONLY (Jorge: finish TRANSP, then clone for TRK + USMCA).
    if (body.operating_company_id !== TRANSP_OPERATING_COMPANY_ID) {
      return reply.code(400).send({
        error: "transp_only",
        message:
          "CHAIN-03 STEP-1 is TRANSPORTATION-only. TRK and USMCA are cloned in a later step.",
      });
    }

    try {
      const draft = await withCompanyScope(user.uuid, body.operating_company_id, (client) =>
        computeBillGlDraft(client, body.operating_company_id, {
          bill_label: body.bill_label ?? null,
          posting_date: body.posting_date ?? null,
          lines: body.lines.map((l) => ({
            category_kind: l.category_kind ?? null,
            category_code: l.category_code ?? null,
            amount_cents: l.amount_cents,
            description: l.description ?? null,
          })),
        })
      );

      return {
        step: "CHAIN-03-STEP-1-draft-je",
        posting_enabled: BILL_GL_POSTING_ENABLED,
        wrote_to_ledger: false,
        draft,
      };
    } catch (err) {
      if (err instanceof BillGlDraftError) {
        // Deliberate, named accounting failures (fail-loud) → 422 with the code so GUARD sees exactly why.
        return reply.code(422).send({ error: "draft_unresolvable", code: err.code, message: err.message });
      }
      throw err;
    }
  });
}
