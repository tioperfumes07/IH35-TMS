import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { companyBusinessDate } from "../lib/company-business-date.js";

// CUSTVEND-PAR-1: Vendor credit CRUD + apply-to-bill + void.
// NO GL posting — marks QBO-parity data only. GL rides the existing bill-GL chain when flags turn ON.
// accounting.vendor_credits table: migration 0222. vendor_credit_applications: migration 202607170000.

const idParamSchema = z.object({ id: z.string().uuid() });

const createBodySchema = z.object({
  vendor_id: z.string().trim().min(1),
  issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  amount_cents: z.coerce.number().int().positive(),
  coa_account_id: z.string().uuid().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

const applyBodySchema = z.object({
  applications: z.array(
    z.object({
      bill_id: z.string().uuid(),
      applied_cents: z.coerce.number().int().positive(),
      // Retry-safety. Unique per entity among non-voided rows
      // (uq_vendor_credit_app_idempotency, migration 202607750000), so a double-submit or a retry
      // after a timeout inserts once instead of decrementing the credit twice.
      idempotency_key: z.string().trim().min(1).max(200).optional(),
    })
  ).min(1).max(50),
});

const voidBodySchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

const listQuerySchema = companyQuerySchema.extend({
  vendor_id: z.string().trim().optional(),
  status: z.enum(["open", "applied", "voided"]).optional(),
});

function canWriteVendorCredits(role: string) {
  return ["Owner", "Administrator", "Manager", "Accountant"].includes(role);
}

function nextVendorCreditDisplayId(nowDate: string, seq: number): string {
  const year = nowDate.slice(0, 4);
  const pad = String(seq).padStart(4, "0");
  return `VC-${year}-${pad}`;
}

export async function registerVendorCreditsRoutes(app: FastifyInstance) {
  // GET /api/v1/accounting/vendor-credits?operating_company_id=...&vendor_id=...&status=...
  app.get("/api/v1/accounting/vendor-credits", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const conditions: string[] = ["vc.operating_company_id = $1"];
      const params: unknown[] = [query.data.operating_company_id];

      if (query.data.vendor_id) {
        params.push(query.data.vendor_id);
        conditions.push(`vc.vendor_id = $${params.length}`);
      }
      if (query.data.status) {
        params.push(query.data.status);
        conditions.push(`vc.status = $${params.length}`);
      }

      const res = await client.query(
        `SELECT
           vc.id,
           vc.vendor_id,
           vc.display_id,
           vc.status,
           vc.issue_date,
           vc.amount_cents,
           vc.amount_applied_cents,
           vc.amount_unapplied_cents,
           vc.notes,
           vc.created_at,
           vc.created_by_user_id
         FROM accounting.vendor_credits vc
         WHERE ${conditions.join(" AND ")}
         ORDER BY vc.issue_date DESC, vc.created_at DESC
         LIMIT 500`,
        params
      );
      return res.rows;
    });

    return { credits: rows };
  });

  // POST /api/v1/accounting/vendor-credits
  app.post("/api/v1/accounting/vendor-credits", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canWriteVendorCredits(user.role)) return reply.code(403).send({ error: "forbidden" });

    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = createBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const vendorRes = await client.query(
        `SELECT id FROM mdata.vendors WHERE id = $1 AND operating_company_id = $2 LIMIT 1`,
        [body.data.vendor_id, query.data.operating_company_id]
      );
      if (!vendorRes.rows[0]) return { code: 404 as const, error: "vendor_not_found" };

      const issueDate = body.data.issue_date ?? companyBusinessDate();

      const seqRes = await client.query(
        `SELECT COUNT(*)::int + 1 AS seq
         FROM accounting.vendor_credits
         WHERE operating_company_id = $1 AND display_id LIKE $2`,
        [query.data.operating_company_id, `VC-${issueDate.slice(0, 4)}-%`]
      );
      const displayId = nextVendorCreditDisplayId(issueDate, Number(seqRes.rows[0]?.seq ?? 1));

      const insRes = await client.query(
        `INSERT INTO accounting.vendor_credits
           (operating_company_id, vendor_id, display_id, issue_date, amount_cents, notes, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, display_id, status, issue_date, amount_cents, amount_unapplied_cents`,
        [
          query.data.operating_company_id,
          body.data.vendor_id,
          displayId,
          issueDate,
          body.data.amount_cents,
          body.data.notes ?? null,
          user.uuid,
        ]
      );
      const credit = insRes.rows[0];
      if (!credit) return { code: 500 as const, error: "vendor_credit_create_failed" };

      await appendCrudAudit(
        client,
        user.uuid,
        "accounting.vendor_credits.created",
        { resource_type: "accounting.vendor_credits", resource_id: String(credit.id), display_id: displayId, vendor_id: body.data.vendor_id },
        "info",
        "CUSTVEND-PAR-1"
      );

      return { code: 201 as const, data: credit };
    });

    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    return reply.code(result.code).send(result.data);
  });

  // POST /api/v1/accounting/vendor-credits/:id/apply — apply credit to one or more bills
  app.post("/api/v1/accounting/vendor-credits/:id/apply", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canWriteVendorCredits(user.role)) return reply.code(403).send({ error: "forbidden" });

    const params = idParamSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = applyBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const creditRes = await client.query(
        `SELECT id, status, amount_unapplied_cents FROM accounting.vendor_credits
         WHERE id = $1 AND operating_company_id = $2 LIMIT 1`,
        [params.data.id, query.data.operating_company_id]
      );
      const credit = creditRes.rows[0];
      if (!credit) return { code: 404 as const, error: "vendor_credit_not_found" };
      if (credit.status === "voided") return { code: 409 as const, error: "vendor_credit_voided" };

      const totalApplying = body.data.applications.reduce((s, a) => s + a.applied_cents, 0);
      const unapplied = Number(credit.amount_unapplied_cents);
      if (totalApplying > unapplied) {
        return {
          code: 422 as const,
          error: "over_apply_refused",
          unapplied_cents: unapplied,
          requested_cents: totalApplying,
        };
      }

      const applicationIds: string[] = [];
      for (const app of body.data.applications) {
        const billRes = await client.query(
          `SELECT id, amount_cents, paid_cents FROM accounting.bills
           WHERE id = $1 AND operating_company_id = $2 AND revoked_at IS NULL LIMIT 1`,
          [app.bill_id, query.data.operating_company_id]
        );
        const bill = billRes.rows[0];
        if (!bill) return { code: 404 as const, error: `bill_not_found:${app.bill_id}` };

        // CAP THE APPLICATION AT THE BILL'S REMAINING BALANCE.
        // amount_cents and paid_cents were already SELECTed above and then never used, so the only
        // ceiling was the credit's own unapplied amount: a $5,000 credit could be applied to a $100
        // bill and drive it negative. Remaining balance must also net off credits ALREADY applied to
        // this bill, or two half-size applications could still overshoot together.
        const alreadyAppliedRes = await client.query(
          `SELECT COALESCE(SUM(applied_cents), 0)::text AS applied_cents
             FROM accounting.vendor_credit_applications
            WHERE bill_id = $1
              AND operating_company_id = $2
              AND voided_at IS NULL`,
          [app.bill_id, query.data.operating_company_id]
        );
        const billRemainingCents =
          Number(bill.amount_cents ?? 0)
          - Number(bill.paid_cents ?? 0)
          - Number(alreadyAppliedRes.rows[0]?.applied_cents ?? 0);
        if (app.applied_cents > billRemainingCents) {
          return {
            code: 422 as const,
            error: "applied_cents_exceeds_bill_balance",
            detail: {
              bill_id: app.bill_id,
              applied_cents: app.applied_cents,
              bill_remaining_cents: Math.max(0, billRemainingCents),
            },
          };
        }

        const appRes = await client.query(
          `INSERT INTO accounting.vendor_credit_applications
             (operating_company_id, credit_id, bill_id, applied_cents, applied_by_user_id, idempotency_key)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [
            query.data.operating_company_id,
            params.data.id,
            app.bill_id,
            app.applied_cents,
            user.uuid,
            app.idempotency_key ?? null,
          ]
        );
        applicationIds.push(String(appRes.rows[0]?.id ?? ""));
      }

      await client.query(
        `UPDATE accounting.vendor_credits
         SET amount_applied_cents = amount_applied_cents + $2,
             status = CASE
               WHEN amount_applied_cents + $2 >= amount_cents THEN 'applied'
               ELSE status
             END
         WHERE id = $1`,
        [params.data.id, totalApplying]
      );

      await appendCrudAudit(
        client,
        user.uuid,
        "accounting.vendor_credits.applied",
        {
          resource_type: "accounting.vendor_credits",
          resource_id: params.data.id,
          total_applied_cents: totalApplying,
          bill_count: body.data.applications.length,
        },
        "info",
        "CUSTVEND-PAR-1"
      );

      return { code: 200 as const, data: { applicationIds } };
    });

    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    return reply.code(result.code).send(result.data);
  });

  // POST /api/v1/accounting/vendor-credits/:id/void — void (never delete)
  app.post("/api/v1/accounting/vendor-credits/:id/void", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canWriteVendorCredits(user.role)) return reply.code(403).send({ error: "forbidden" });

    const params = idParamSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = voidBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const creditRes = await client.query(
        `SELECT id, status FROM accounting.vendor_credits
         WHERE id = $1 AND operating_company_id = $2 LIMIT 1`,
        [params.data.id, query.data.operating_company_id]
      );
      const credit = creditRes.rows[0];
      if (!credit) return { code: 404 as const, error: "vendor_credit_not_found" };
      if (credit.status === "voided") return { code: 409 as const, error: "already_voided" };

      // Reverse active applications before voiding (void-never-delete: mark voided_at on each)
      await client.query(
        `UPDATE accounting.vendor_credit_applications
         SET voided_at = now(), voided_by_user_id = $2, voided_reason = $3
         WHERE credit_id = $1 AND voided_at IS NULL`,
        [params.data.id, user.uuid, body.data.reason]
      );
      // Zero out applied amount and mark voided
      await client.query(
        `UPDATE accounting.vendor_credits
         SET status = 'voided', amount_applied_cents = 0
         WHERE id = $1`,
        [params.data.id]
      );

      await appendCrudAudit(
        client,
        user.uuid,
        "accounting.vendor_credits.voided",
        { resource_type: "accounting.vendor_credits", resource_id: params.data.id, reason: body.data.reason },
        "warning",
        "CUSTVEND-PAR-1"
      );

      return { code: 200 as const, data: { ok: true } };
    });

    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    return reply.code(result.code).send(result.data);
  });
}
