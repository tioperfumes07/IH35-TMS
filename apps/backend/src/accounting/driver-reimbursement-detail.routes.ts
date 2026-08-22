import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { withCurrentUser } from "../auth/db.js";
import { companyQuerySchema, currentAuthUser, validationError } from "./shared.js";

const paramsSchema = z.object({ id: z.string().uuid() });

/** Exact read-only reverse surface for the canonical driver reimbursement source row. */
export async function registerDriverReimbursementDetailRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/driver-reimbursements/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const params = paramsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const opco = query.data.operating_company_id;
    await assertCompanyMembership(user.uuid, opco);
    const row = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      const result = await client.query(
        `SELECT r.id::text, r.driver_id::text, r.load_id::text, r.reimbursement_type,
                r.amount_cents::text, r.reason, r.pay_mode, r.status, r.posting_date::text,
                r.paid_at::text, r.journal_entry_id::text, r.applied_to_settlement_id::text,
                r.evidence_doc_id::text, r.voided_at::text, r.void_reason,
                r.from_bank_account_id::text, r.created_at::text, r.updated_at::text,
                NULLIF(TRIM(CONCAT(COALESCE(d.first_name, ''), ' ', COALESCE(d.last_name, ''))), '') AS driver_name,
                l.load_number, s.display_id AS settlement_number, ba.account_name AS bank_account_name
           FROM driver_finance.driver_reimbursements r
           JOIN mdata.drivers d ON d.id = r.driver_id AND d.operating_company_id = r.operating_company_id
           LEFT JOIN mdata.loads l ON l.id = r.load_id AND l.operating_company_id = r.operating_company_id
           LEFT JOIN driver_finance.driver_settlements s ON s.id = r.applied_to_settlement_id AND s.operating_company_id = r.operating_company_id
           LEFT JOIN banking.bank_accounts ba ON ba.id = r.from_bank_account_id AND ba.operating_company_id = r.operating_company_id
          WHERE r.operating_company_id = $1::uuid AND r.id = $2::uuid
          LIMIT 1`,
        [opco, params.data.id],
      );
      return result.rows[0] ?? null;
    });
    if (!row) return reply.code(404).send({ error: "DRIVER_REIMBURSEMENT_NOT_FOUND", message: "Driver reimbursement not found for this operating company." });
    return reply.send(row);
  });
}
