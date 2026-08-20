import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { companyBusinessDate } from "../lib/company-business-date.js";
import { nextVendorCreditDisplayId } from "./display-id.js";
import { resolveVendorIdentitySet } from "./vendor-identity.js";

// CUSTVEND-PAR-1: Vendor credit CRUD + apply-to-bill + void.
// NO GL posting — marks QBO-parity data only. GL rides the existing bill-GL chain when flags turn ON.
// accounting.vendor_credits table: migration 0222. vendor_credit_applications: migration 202607170000.

const idParamSchema = z.object({ id: z.string().uuid() });

const createBodySchema = z.object({
  // mdata.vendors.id — a uuid. Free-form text here reached `WHERE id = $1` and made Postgres raise
  // 22P02 (a 500) instead of answering "unknown vendor".
  vendor_id: z.string().trim().uuid(),
  issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  amount_cents: z.coerce.number().int().positive(),
  // accounting.vendor_credits has NO coa_account_id column (verified on the Neon prod branch), so a
  // value here was accepted and dropped. Refused loudly instead — a designated GL account that
  // silently disappears is the "empty binding / silent skip" defect class.
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

export async function registerVendorCreditsRoutes(app: FastifyInstance) {
  // GET /api/v1/accounting/vendor-credits?operating_company_id=...&vendor_id=...&status=...
  app.get("/api/v1/accounting/vendor-credits", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const conditions: string[] = ["vc.operating_company_id = $1::uuid"];
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
           v.vendor_name,
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
         LEFT JOIN mdata.vendors v
           ON v.id::text = vc.vendor_id
          AND v.operating_company_id = vc.operating_company_id
         WHERE ${conditions.join(" AND ")}
         ORDER BY vc.issue_date DESC, vc.created_at DESC
         LIMIT 500`,
        params
      );
      return res.rows;
    });

    return { credits: rows };
  });

  // Law §9 reverse drill-through: a credit must expose every bill it reduced.
  // Read-only and company-scoped; this route does not calculate or post any GL.
  app.get("/api/v1/accounting/vendor-credits/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const detail = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const creditRes = await client.query(
        `SELECT
           vc.id,
           vc.vendor_id,
           v.vendor_name,
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
         LEFT JOIN mdata.vendors v
           ON v.id::text = vc.vendor_id
          AND v.operating_company_id = vc.operating_company_id
         WHERE vc.id = $1
           AND vc.operating_company_id = $2::uuid
         LIMIT 1`,
        [params.data.id, query.data.operating_company_id]
      );
      const credit = creditRes.rows[0];
      if (!credit) return null;

      const applicationsRes = await client.query(
        `SELECT
           vca.id,
           vca.bill_id,
           b.bill_number,
           vca.applied_cents,
           vca.applied_at,
           vca.voided_at
         FROM accounting.vendor_credit_applications vca
         JOIN accounting.bills b
           ON b.id = vca.bill_id
          AND b.operating_company_id = vca.operating_company_id
         WHERE vca.credit_id = $1
           AND vca.operating_company_id = $2::uuid
         ORDER BY vca.applied_at DESC, vca.id DESC`,
        [params.data.id, query.data.operating_company_id]
      );
      return { credit, applications: applicationsRes.rows };
    });

    if (!detail) return reply.code(404).send({ error: "vendor_credit_not_found" });
    return detail;
  });

  // POST /api/v1/accounting/vendor-credits
  app.post("/api/v1/accounting/vendor-credits", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canWriteVendorCredits(user.role)) return reply.code(403).send({ error: "forbidden" });

    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = createBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    if (body.data.coa_account_id != null) {
      return reply.code(422).send({
        error: "coa_account_id_not_persisted",
        detail: "accounting.vendor_credits has no GL account column; the credit rides the bill GL chain",
      });
    }

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const vendorRes = await client.query(
        `SELECT id FROM mdata.vendors WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`,
        [body.data.vendor_id, query.data.operating_company_id]
      );
      if (!vendorRes.rows[0]) return { code: 404 as const, error: "vendor_not_found" };

      const issueDate = body.data.issue_date ?? companyBusinessDate();

      // Canonical generator (same advisory-lock + MAX pattern as invoices/payments/credit memos).
      // The private COUNT(*)+1 this replaced took no lock, so two concurrent creates produced the
      // same VC number and one of them died on vendor_credits_operating_company_id_display_id_key.
      const displayId = await nextVendorCreditDisplayId(
        client,
        query.data.operating_company_id,
        new Date(`${issueDate}T00:00:00Z`)
      );

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
  app.post("/api/v1/accounting/vendor-credits/:id/apply", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
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
      // ACCT-F5639 — FOR UPDATE, same row-lock pattern applied to the sibling /void endpoint below and
      // the AR mirror (credit-memos.routes.ts). Closes two races at once: a concurrent /void call can
      // no longer read this row unlocked while this apply is mid-flight (which previously let a vendor
      // credit end up 'voided' with a live, non-voided application row still standing), and two
      // concurrent /apply calls can no longer both read the same stale amount_unapplied_cents and
      // jointly over-apply the credit beyond its face amount across two different bills.
      const creditRes = await client.query(
        `SELECT id, status, vendor_id, amount_unapplied_cents FROM accounting.vendor_credits
         WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1
         FOR UPDATE`,
        [params.data.id, query.data.operating_company_id]
      );
      const credit = creditRes.rows[0];
      if (!credit) return { code: 404 as const, error: "vendor_credit_not_found" };
      if (credit.status === "voided") return { code: 409 as const, error: "vendor_credit_voided" };

      // A credit belongs to ONE vendor. The bill lookup below is keyed only by id + company, so
      // vendor A's credit could settle vendor B's bill — an A/P misstatement on both vendors.
      // Identity set, not equality: the credit carries an mdata.vendors uuid while QBO-sourced
      // bills carry the QBO vendor id.
      const creditVendorIdentities = new Set(
        await resolveVendorIdentitySet(client, query.data.operating_company_id, String(credit.vendor_id))
      );

      // ACCT-F5618 — resolve idempotent replays FIRST, before the over-apply check. A retried
      // request (double-click, client timeout+retry) with the same idempotency_key must return the
      // SAME success result, never a fresh INSERT and never a stale over-apply rejection computed
      // against a balance that ALREADY reflects the first successful call. Mirrors
      // settlement-posting.service.ts's own findExistingPostedJe pre-check pattern (look up by the
      // uq_vendor_credit_app_idempotency unique index, 202607750000, before inserting) rather than
      // catching 23505 — catching after the fact would still 500/409 on the retry instead of
      // transparently replaying. Same fix, same shape, as the AR sibling (credit-memos.routes.ts).
      const applicationIds: string[] = [];
      const newApplications: typeof body.data.applications = [];
      for (const app of body.data.applications) {
        if (app.idempotency_key) {
          const existing = await client.query(
            `SELECT id FROM accounting.vendor_credit_applications
              WHERE operating_company_id = $1::uuid AND idempotency_key = $2 AND voided_at IS NULL
              LIMIT 1`,
            [query.data.operating_company_id, app.idempotency_key]
          );
          if (existing.rows[0]) {
            applicationIds.push(String(existing.rows[0].id));
            continue;
          }
        }
        newApplications.push(app);
      }

      const totalApplying = newApplications.reduce((s, a) => s + a.applied_cents, 0);
      const unapplied = Number(credit.amount_unapplied_cents);
      if (totalApplying > unapplied) {
        return {
          code: 422 as const,
          error: "over_apply_refused",
          unapplied_cents: unapplied,
          requested_cents: totalApplying,
        };
      }

      for (const app of newApplications) {
        const billRes = await client.query(
          `SELECT id, amount_cents, paid_cents,
                  COALESCE(NULLIF(vendor_id, ''), NULLIF(vendor_uuid, '')) AS vendor_id
             FROM accounting.bills
            WHERE id = $1 AND operating_company_id = $2::uuid AND revoked_at IS NULL LIMIT 1`,
          [app.bill_id, query.data.operating_company_id]
        );
        const bill = billRes.rows[0];
        if (!bill) return { code: 404 as const, error: `bill_not_found:${app.bill_id}` };

        if (!bill.vendor_id || !creditVendorIdentities.has(String(bill.vendor_id))) {
          return {
            code: 422 as const,
            error: "bill_vendor_mismatch",
            detail: {
              bill_id: app.bill_id,
              bill_vendor_id: bill.vendor_id ?? null,
              credit_vendor_id: String(credit.vendor_id),
            },
          };
        }

        // CAP THE APPLICATION AT THE BILL'S REMAINING BALANCE.
        // amount_cents and paid_cents were already SELECTed above and then never used, so the only
        // ceiling was the credit's own unapplied amount: a $5,000 credit could be applied to a $100
        // bill and drive it negative. Remaining balance must also net off credits ALREADY applied to
        // this bill, or two half-size applications could still overshoot together.
        const alreadyAppliedRes = await client.query(
          `SELECT COALESCE(SUM(applied_cents), 0)::text AS applied_cents
             FROM accounting.vendor_credit_applications
            WHERE bill_id = $1
              AND operating_company_id = $2::uuid
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

    if ("error" in result) {
      // Refusals carry the numbers the operator needs (remaining credit, bill balance, the two
      // vendor ids). Sending only `error` made a legitimate refusal look like an opaque failure.
      const { code, ...payload } = result;
      return reply.code(code).send(payload);
    }
    return reply.code(result.code).send(result.data);
  });

  // POST /api/v1/accounting/vendor-credits/:id/void — void (never delete)
  app.post("/api/v1/accounting/vendor-credits/:id/void", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
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
      // ACCT-F5639 — FOR UPDATE, matching the sibling row-lock pattern this codebase already uses on
      // every other void writer (bills.service.ts, payments.routes.ts's ACCT-F5636 fix, every
      // governance/void-cancel-executors.ts executor, and the AR mirror credit-memos.routes.ts).
      // Without it, a concurrent /apply request can INSERT a vendor_credit_applications row and this
      // /void call's status check can both read the pre-apply state before either commits — the
      // applications UPDATE below (voided_at IS NULL) then misses the just-applied row entirely
      // (invisible under READ COMMITTED), so the credit ends up status='voided' while a live,
      // non-voided application row still stands: a permanently stranded application that every
      // downstream netting query (verify-bill-payment-nets-vendor-credits, ACCT-F5623) will keep
      // counting against the bill forever, understating its true open balance.
      const creditRes = await client.query(
        `SELECT id, status FROM accounting.vendor_credits
         WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1
         FOR UPDATE`,
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
      // Zero out applied amount and mark voided. Belt-and-suspenders alongside the row lock: WHERE
      // status <> 'voided', matching payments.routes.ts's own pattern.
      const flipped = await client.query(
        `UPDATE accounting.vendor_credits
         SET status = 'voided', amount_applied_cents = 0
         WHERE id = $1
           AND status <> 'voided'`,
        [params.data.id]
      );
      if (flipped.rowCount === 0) return { code: 409 as const, error: "already_voided" };

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
