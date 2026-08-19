import type { FastifyInstance, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { nextPaymentDisplayId } from "./display-id.js";
import { enqueueAccountingOutbox } from "./outbox-events.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { emitAccountingSpineEvent } from "./accounting-spine-emit.js";
import { assertBankAccountUsable } from "../banking/bank-account-visibility.js";
import { resolveRoleAccountOptional } from "./coa-roles/resolver.service.js";
import { postSourceTransactionInClientTx } from "./posting-engine.service.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import { recordPostingFlagSkip } from "./posting-flag-skip-audit.js";
import { canVoidCancel } from "../lib/authz/void-cancel-authz.js";

const paymentMethodSchema = z.enum([
  "ach",
  "wire",
  "check",
  "cash",
  "factoring_advance",
  "factoring_reserve",
  "credit_card",
  "other",
]);

const customerIdParamsSchema = z.object({
  id: z.string().uuid(),
});

const listCustomerPaymentsQuerySchema = companyQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const createCustomerPaymentBodySchema = z.object({
  received_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount_cents: z.coerce.number().int().positive(),
  payment_method: paymentMethodSchema,
  bank_account_id: z.string().uuid().optional(),
  reference_number: z.string().trim().max(200).optional(),
  // FAIL-F2 sweep / ACCT-F264 — without this the flag cannot be SUPPLIED, so the INSERT has nothing to
  // write. Optional; only an explicit true marks sample.
  is_sample_data: z.boolean().optional(),
  applications: z
    .array(
      z.object({
        invoice_id: z.string().uuid(),
        amount_cents: z.coerce.number().int().positive(),
      })
    )
    .default([]),
});

// ACCT-F5581: POST /:id/payments records a real cash receipt and, when
// CUSTOMER_PAYMENT_GL_POSTING_ENABLED is on, posts a real journal entry (see the CLS-SUBLEDGER-GL-DARK
// comment below on the route itself) -- yet had no role gate at all, any authenticated company member
// could fabricate a "payment received" record. Reuses the canonical void/cancel executor role set
// (Owner/Administrator/Accountant, Jorge-locked 2026-06-29) since recording cash receipt is the same
// tier of financial-executor operation, not because this is a void/cancel action.
function requirePaymentWriteRole(reply: FastifyReply, role: string) {
  if (!canVoidCancel(role)) {
    reply.code(403).send({ error: "forbidden", detail: "recording a customer payment requires an accounting role" });
    return false;
  }
  return true;
}

export async function registerCustomerPaymentsRoutes(app: FastifyInstance) {
  // Rate-limited (CodeQL js/missing-rate-limiting). Pre-existing gap surfaced because this PR touched
  // the file; the plugin is registered global:false so an un-configured route has NO limit at all.
  app.get("/api/v1/customers/:id/payments", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const params = customerIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = listCustomerPaymentsQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const custRes = await client.query(`SELECT id FROM mdata.customers WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`, [
        params.data.id,
        query.data.operating_company_id,
      ]);
      if (!custRes.rows[0]) return { code: 404 as const, error: "customer_not_found" as const };

      const whereSql = `p.customer_id = $2 AND p.operating_company_id = $1::uuid AND p.voided_at IS NULL`;
      const values: unknown[] = [query.data.operating_company_id, params.data.id];

      const countRes = await client.query(`SELECT COUNT(*)::int AS total FROM accounting.payments p WHERE ${whereSql}`, values);
      values.push(query.data.limit, query.data.offset);
      const limitIdx = values.length - 1;
      const offsetIdx = values.length;

      const rowsRes = await client.query(
        `
          SELECT
            p.id,
            -- LINK-F5170: the real, human-facing payment identity (format PMT-YYYY-NNNNN) was never
            -- selected, so the customer-detail UI could not render it and fell back to entityLabel's
            -- raw-uuid path.
            p.display_id,
            p.payment_date::text AS date,
            p.amount_cents,
            p.payment_source_kind AS source_kind,
            p.source_bank_transaction_id,
            p.qbo_payment_id,
            COALESCE(apps.applied_to_invoices, '[]'::json) AS applied_to_invoices
          FROM accounting.payments p
          LEFT JOIN LATERAL (
            SELECT json_agg(
              json_build_object(
                'invoice_id', pa.invoice_id,
                'amount_cents', pa.amount_cents,
                'invoice_display_id', i.display_id
              )
              ORDER BY pa.applied_at
            ) AS applied_to_invoices
            FROM accounting.payment_applications pa
            -- ENTITY PREDICATE (CLS-JOIN-ENTITY-UNSCOPED): the payment p is scoped by the outer WHERE,
            -- but the invoice it resolves to was not. This join supplies invoice_display_id, and
            -- display_id is unique PER ENTITY, not globally — INV-2026-00004 exists on both USMCA (a $0
            -- test row) and TRANSP (a PAID $3,800 LONGSHIP invoice), verified live. So an unscoped join
            -- could label a payment application with another entity's invoice number, which reads as a
            -- legitimate reference and is impossible to spot downstream.
            JOIN accounting.invoices i ON i.id = pa.invoice_id
                                      AND i.operating_company_id = p.operating_company_id
            WHERE pa.payment_id = p.id
          ) apps ON true
          WHERE ${whereSql}
          ORDER BY p.payment_date DESC, p.created_at DESC
          LIMIT $${limitIdx}
          OFFSET $${offsetIdx}
        `,
        values
      );

      return {
        code: 200 as const,
        data: {
          rows: rowsRes.rows,
          total: Number(countRes.rows[0]?.total ?? 0),
        },
      };
    });

    if ("code" in payload && payload.code === 404) return reply.code(404).send({ error: payload.error });
    return payload.data;
  });

  app.post(
    "/api/v1/customers/:id/payments",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!requirePaymentWriteRole(reply, String(user.role ?? ""))) return;

    const params = customerIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = createCustomerPaymentBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const sumApplied = body.data.applications.reduce((sum, row) => sum + Number(row.amount_cents ?? 0), 0);
    if (sumApplied > body.data.amount_cents) {
      return reply.code(400).send({ error: "payment_apply_exceeds_total" });
    }

    const dup = new Set<string>();
    for (const row of body.data.applications) {
      if (dup.has(row.invoice_id)) return reply.code(400).send({ error: "duplicate_invoice_in_applications" });
      dup.add(row.invoice_id);
    }

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const customerRes = await client.query(
        `SELECT id FROM mdata.customers WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`,
        [params.data.id, query.data.operating_company_id]
      );
      if (!customerRes.rows[0]) return { code: 404 as const, error: "customer_not_found" as const };

      // deposited_to_account_id stores catalogs.accounts.id (GL debit). bank_account_id is the
      // Banking row — bridge via ledger_account_id. Never store a free-text bank slug.
      let depositedToAccountId: string | null = null;
      if (body.data.bank_account_id) {
        const acctRes = await client.query(
          `
            SELECT id::text AS id, ledger_account_id::text AS ledger_account_id
            FROM banking.bank_accounts
            WHERE id = $1::uuid
              AND operating_company_id = $2::uuid
            LIMIT 1
          `,
          [body.data.bank_account_id, query.data.operating_company_id]
        );
        const bankRow = acctRes.rows[0] as { id: string; ledger_account_id: string | null } | undefined;
        if (!bankRow) return { code: 400 as const, error: "bank_account_not_found" };
        // BANK-ACCOUNT-HIDE: an account hidden for THIS entity can never receive a NEW payment
        // deposit (flag OFF by default — see docs/accounting/BANK-ACCOUNT-ENTITY-HIDE-DESIGN.md).
        if (!(await assertBankAccountUsable(client, body.data.bank_account_id, query.data.operating_company_id))) {
          return { code: 400 as const, error: "bank_account_not_found" };
        }
        depositedToAccountId = bankRow.ledger_account_id;
        if (!depositedToAccountId) return { code: 400 as const, error: "bank_account_missing_ledger_gl" };
      } else {
        depositedToAccountId =
          (await resolveRoleAccountOptional(client, query.data.operating_company_id, "undeposited_funds")) ??
          (await resolveRoleAccountOptional(client, query.data.operating_company_id, "cash_clearing"));
        if (!depositedToAccountId) return { code: 400 as const, error: "deposited_to_account_required" };
      }

      const displayId = await nextPaymentDisplayId(client, query.data.operating_company_id, new Date(`${body.data.received_at}T00:00:00.000Z`));

      const paymentRes = await client.query(
        `
          INSERT INTO accounting.payments (
            operating_company_id,
            customer_id,
            display_id,
            payment_method,
            payment_date,
            reference,
            amount_cents,
            deposited_to_account_id,
            notes,
            created_by_user_id,
            payment_source_kind,
            source_bank_transaction_id,
            -- FAIL-F2 sweep / ACCT-F264 — customer payments could not be marked TEST data either.
            -- accounting.payments.is_sample_data exists (12,129 rows) and NOTHING wrote it, exactly as
            -- expenses and bills did not until #4993. posting-engine resolves the flag from the SOURCE
            -- row (customer_payment is in SAMPLE_TAGGED_SOURCE_TABLES), so an untagged payment yields
            -- an untagged journal entry and sample cash lands in real books.
            is_sample_data
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
          RETURNING id, display_id, amount_unapplied_cents
        `,
        [
          query.data.operating_company_id,
          params.data.id,
          displayId,
          body.data.payment_method,
          body.data.received_at,
          body.data.reference_number ?? null,
          body.data.amount_cents,
          depositedToAccountId,
          null,
          user.uuid,
          "manual",
          null,
          // $13 — only an explicit true marks sample; omitting it keeps the column's false default, so
          // no existing caller changes behaviour and nothing is retroactively re-classified.
          body.data.is_sample_data === true,
        ]
      );
      const payment = paymentRes.rows[0] as { id: string; display_id: string; amount_unapplied_cents: number } | undefined;
      if (!payment?.id) return { code: 500 as const, error: "payment_create_failed" as const };

      let applicationsCount = 0;
      for (const applyRow of body.data.applications) {
        const invoiceRes = await client.query(
          `
            SELECT id, amount_open_cents, status
            FROM accounting.invoices
            WHERE id = $1
              AND operating_company_id = $2::uuid
              AND customer_id = $3
            LIMIT 1
          `,
          [applyRow.invoice_id, query.data.operating_company_id, params.data.id]
        );
        const invoice = invoiceRes.rows[0] as { id: string; amount_open_cents: number; status: string } | null;
        if (!invoice) return { code: 404 as const, error: "invoice_not_found_for_customer" as const };
        if (!["sent", "partial"].includes(String(invoice.status))) return { code: 409 as const, error: "invoice_not_open_for_payment" as const };
        if (Number(applyRow.amount_cents) > Number(invoice.amount_open_cents ?? 0)) return { code: 400 as const, error: "apply_amount_exceeds_invoice_open" as const };

        await client.query(
          `
            INSERT INTO accounting.payment_applications (
              operating_company_id,
              payment_id,
              invoice_id,
              target_kind,
              target_id,
              amount_cents,
              amount_applied,
              applied_by_user_id,
              applied_by_user_uuid
            ) VALUES ($1,$2,$3,'invoice',$3,$4,$5,$6,$6)
          `,
          [
            query.data.operating_company_id,
            payment.id,
            applyRow.invoice_id,
            applyRow.amount_cents,
            applyRow.amount_cents / 100,
            user.uuid,
          ]
        );
        applicationsCount += 1;
      }

      // CLS-SUBLEDGER-GL-DARK / ACCT-F150 — POST THE RECEIPT.
      //
      // This route creates the payment AND its applications in one operation, so A/R moves here. It
      // never called the poster, which is why USMCA payment a0b83bf5 applied $250.00 against an
      // invoice on 2026-08-06 and produced ZERO journal_entry_postings — subledger moved, ledger
      // stayed dark, books out by $250 with nothing reporting a failure. It was not a flag or a
      // mapping problem: CUSTOMER_PAYMENT_GL_POSTING_ENABLED was true for USMCA, ar_control (1100)
      // and undeposited_funds (1090) were bound and active fifteen days earlier, and the payment was
      // source_system='tms'. The poster simply was never invoked on this path.
      //
      // apply.service.ts was audited and hardened for exactly this; the ROUTES were never wired to
      // it. Same gate, same skip-audit, same poster — no new GL math (locked rule: reuse the existing
      // poster). Flag OFF still writes the payment and applications and records the skip append-only,
      // so a skip can never read as a silent success.
      const customerPaymentPostingEnabled = await isEnabled(client, "CUSTOMER_PAYMENT_GL_POSTING_ENABLED", {
        operating_company_id: query.data.operating_company_id,
        user_uuid: user.uuid,
      });
      if (applicationsCount > 0 && customerPaymentPostingEnabled) {
        // ATOMICITY — this MUST be the in-client-tx poster, not postSourceTransaction().
        // withCompanyScope -> withCurrentUser does pool.connect() + BEGIN ... COMMIT, so this callback
        // runs inside an open transaction and the payment row above is NOT yet committed.
        // postSourceTransaction() takes its own pool connection and its own transaction, so from there
        // the payment does not exist yet — the poster would find nothing and the receipt would stay
        // dark, which is the very defect this block fixes. Passing the caller's client also makes the
        // payment, its applications and its journal entry commit or roll back as ONE unit: there is no
        // window in which A/R has moved and the GL has not.
        await postSourceTransactionInClientTx(
          client,
          {
            operating_company_id: query.data.operating_company_id,
            source_transaction_type: "customer_payment",
            source_transaction_id: payment.id,
            posting_purpose: "initial_post",
          },
          { userId: user.uuid }
        );
      } else if (applicationsCount > 0) {
        await recordPostingFlagSkip(client, user.uuid, {
          flagKey: "CUSTOMER_PAYMENT_GL_POSTING_ENABLED",
          postingDomain: "customer_payment",
          operatingCompanyId: query.data.operating_company_id,
          context: { payment_id: payment.id, route: "POST /api/v1/customers/:id/payments" },
        });
      }

      const refreshedRes = await client.query(`SELECT amount_unapplied_cents FROM accounting.payments WHERE id = $1 LIMIT 1`, [payment.id]);
      const refreshed = refreshedRes.rows[0] ?? { amount_unapplied_cents: 0 };

      await enqueueAccountingOutbox(client, query.data.operating_company_id, "qbo.customer_payment.created", "customer_payment", payment.id, {
        payment_id: payment.id,
        customer_id: params.data.id,
        amount_cents: body.data.amount_cents,
        payment_date: body.data.received_at,
      });

      await appendCrudAudit(
        client,
        user.uuid,
        "accounting.customer_payment.created.p6_t11204",
        {
          resource_type: "accounting.payments",
          resource_id: payment.id,
          operating_company_id: query.data.operating_company_id,
          customer_id: params.data.id,
          display_id: payment.display_id,
          applications_count: applicationsCount,
        },
        "info",
        "P6-T11204-PAYMENTS"
      );

      return {
        code: 201 as const,
        data: {
          id: payment.id,
          display_id: payment.display_id,
          amount_unapplied_cents: Number(refreshed.amount_unapplied_cents ?? 0),
          applications_count: applicationsCount,
        },
      };
    });

    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    void withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
      emitAccountingSpineEvent(client, {
        operating_company_id: query.data.operating_company_id,
        actor_user_id: String(user.uuid),
        event_type: "payment.customer_created",
        entity_id: (result as { data?: { id?: string } })?.data?.id ?? "",
        entity_type: "customer_payment",
        source_table: "accounting.payments",
      })
    ).catch((err) =>
      req.log.warn(
        {
          err,
          customer_payment_id: (result as { data?: { id?: string } })?.data?.id ?? null,
          company_id: query.data.operating_company_id,
        },
        "spine_emit_customer_payment_created_failed"
      )
    );
    return reply.code(result.code).send(result.data);
  });
}


export default fp(async (app) => {
  await registerCustomerPaymentsRoutes(app);
}, { name: "accounting.registerCustomerPaymentsRoutes" });
