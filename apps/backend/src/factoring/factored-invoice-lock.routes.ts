// ROUND 336 rule 7 — a factored invoice's amount is locked while its Faro purchase is open. The DATABASE enforces it
// (trigger trg_refuse_factored_invoice_amount_edit, migration 202615300600); this read lets the edit screen (Cursor's lane)
// show the lock before anyone tries, with the purchase, the Faro invoice number and the way to reduce it.
//   GET /api/v1/factoring/invoices/:id/amount-lock?operating_company_id=
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";

const params = z.object({ id: z.string().uuid() });
const query = z.object({ operating_company_id: z.string().uuid() });

export async function registerFactoredInvoiceLockRoutes(app: FastifyInstance) {
  app.get("/api/v1/factoring/invoices/:id/amount-lock", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const p = params.safeParse(req.params ?? {});
    if (!p.success) return validationError(reply, p.error);
    const q = query.safeParse(req.query ?? {});
    if (!q.success) return validationError(reply, q.error);
    return withCompanyScope(user.uuid, q.data.operating_company_id, async (client) => {
      const r = (await client.query(`SELECT accounting.factored_invoice_amount_lock($1::uuid) AS lock`, [p.data.id])) as { rows: Array<{ lock: string | null }> };
      const lock = r.rows[0]?.lock ?? null;
      return {
        invoice_id: p.data.id,
        amount_locked: lock != null,
        held_by: lock,
        editable_fields_while_locked: ["customer_notes", "internal_notes", "payment_terms_label", "due_date", "bill_to_entity_type"],
        reduce_with: lock ? "reason-coded credit memo (Faro register → short-pay write-down, ROUND 335)" : null,
      };
    });
  });
}
