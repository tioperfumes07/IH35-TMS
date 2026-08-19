import type { FastifyInstance, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { reassignDraftAttachments } from "../documents/attachments.service.js";
import { nextPaymentDisplayId } from "./display-id.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { emitAccountingSpineEvent } from "./accounting-spine-emit.js";
import { requireVoidCancelExecutor, canVoidCancel } from "../lib/authz/void-cancel-authz.js";
import { resolveRoleAccountOptional } from "./coa-roles/resolver.service.js";
import { postSourceTransactionInClientTx } from "./posting-engine.service.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import { recordPostingFlagSkip } from "./posting-flag-skip-audit.js";
import { pgDateColumnToIsoDay, postVoidReversal } from "./void.service.js";

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

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

const listQuerySchema = companyQuerySchema.extend({
  status: z.enum(["active", "voided", "all"]).default("active"),
  customer_id: z.string().uuid().optional(),
  payment_method: paymentMethodSchema.optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  search: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const createBodySchema = z.object({
  customer_id: z.string().uuid(),
  payment_method: paymentMethodSchema,
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reference: z.string().trim().max(200).optional(),
  amount_cents: z.coerce.number().int().positive(),
  deposited_to_account_id: z.string().uuid().optional(),
  notes: z.string().trim().max(5000).optional(),
  // Draft id for create-time payment attachments (check/ACH/wire confirmations); reconciled onto the
  // real payment id in the same txn (Option B inc 2 — docs/specs/ATTACHMENT-DRAFT-LINKAGE-FIX.md).
  attachment_draft_id: z.string().uuid().optional().nullable(),
  // ACCT-F353 — sample-tag writer sweep. Only an explicit true marks sample; omitting it keeps the
  // column's false default (matches ACCT-F264's customer-payments precedent), so no existing caller
  // changes behaviour.
  is_sample_data: z.boolean().optional(),
  apply_to: z
    .array(
      z.object({
        invoice_id: z.string().uuid(),
        amount_cents: z.coerce.number().int().positive(),
      })
    )
    .optional()
    .default([]),
});

const voidBodySchema = z.object({
  void_reason: z.string().trim().min(3).max(500),
});

/**
 * Law §9 reverse hop: payment → banking.bank_transactions.
 * Prefer payments.source_bank_transaction_id (create/categorize provenance); else recon match
 * banking.bank_transactions.matched_payment_id (bank-recon/match.service.ts).
 * Entity-scoped — never cross opco.
 */
const PAYMENT_MATCHED_BANK_TRANSACTION_ID_SQL = `
  COALESCE(
    p.source_bank_transaction_id::text,
    (
      SELECT bt.id::text
      FROM banking.bank_transactions bt
      WHERE bt.operating_company_id = p.operating_company_id
        AND bt.matched_payment_id = p.id
      ORDER BY bt.transaction_date DESC, bt.created_at DESC
      LIMIT 1
    )
  )
`;

async function fetchPaymentDetail(
  client: { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> },
  paymentId: string,
  operatingCompanyId: string
) {
  const paymentRes = await client.query(
    `
      SELECT
        p.*,
        c.customer_name,
        ${PAYMENT_MATCHED_BANK_TRANSACTION_ID_SQL} AS matched_bank_transaction_id,
        dep_acct.account_number AS deposited_to_account_number,
        dep_acct.account_name AS deposited_to_account_name,
        bt.transaction_date AS matched_bank_transaction_date,
        bt.description AS matched_bank_transaction_description,
        bt.amount_cents::text AS matched_bank_transaction_amount_cents
      FROM accounting.payments p
      JOIN mdata.customers c
        ON c.id = p.customer_id
       AND c.operating_company_id = p.operating_company_id
      LEFT JOIN catalogs.accounts dep_acct
        ON dep_acct.id::text = p.deposited_to_account_id
       AND dep_acct.operating_company_id = p.operating_company_id
      LEFT JOIN banking.bank_transactions bt
        ON bt.id = ${PAYMENT_MATCHED_BANK_TRANSACTION_ID_SQL}::uuid
       AND bt.operating_company_id = p.operating_company_id
      WHERE p.id = $1
        AND p.operating_company_id = $2::uuid
      LIMIT 1
    `,
    [paymentId, operatingCompanyId]
  );
  const payment = paymentRes.rows[0] ?? null;
  if (!payment) return null;

  const applicationsRes = await client.query(
    `
      SELECT
        pa.id,
        pa.payment_id,
        pa.invoice_id,
        pa.target_kind,
        pa.target_id,
        pa.amount_cents,
        pa.amount_applied,
        pa.applied_at,
        i.display_id AS invoice_display_id,
        i.amount_open_cents AS invoice_amount_open_cents
      FROM accounting.payment_applications pa
      -- ENTITY PREDICATE (CLS-JOIN-ENTITY-UNSCOPED): this join supplies invoice_display_id, and
      -- display_id is unique PER ENTITY, not globally (INV-2026-00004 exists on USMCA at $0 AND on
      -- TRANSP as a PAID $3,800 invoice, verified live). Unscoped it could label a payment application
      -- with another entity's invoice number. Tied to the application's own company.
      LEFT JOIN accounting.invoices i ON i.id = pa.invoice_id
                                     AND i.operating_company_id = pa.operating_company_id
      WHERE pa.payment_id = $1
      ORDER BY pa.applied_at DESC
    `,
    [paymentId]
  );

  // WAVE-C-gl_je-payments-receive: forward payment -> GL JE, the same read-only pattern
  // invoices.routes.ts:fetchInvoiceDetail already uses (journal_entry_postings joined to
  // journal_entries by source_transaction_type/source_transaction_id). Reuses the existing
  // customer_payment posting the poster already writes (posting-engine.service.ts) — no new
  // GL math, no new table, no posting triggered by this read.
  const journalEntriesRes = await client.query(
    `
      SELECT DISTINCT ON (je.id)
        je.id::text AS journal_entry_id,
        je.entry_date::text AS entry_date,
        je.status,
        je.source,
        je.memo,
        jep.source_transaction_type,
        jep.source_transaction_id,
        jep.posting_batch_id::text AS posting_batch_id
      FROM accounting.journal_entry_postings jep
      JOIN accounting.journal_entries je
        ON je.id = jep.journal_entry_uuid
       AND je.operating_company_id = jep.operating_company_id
      WHERE jep.operating_company_id = $2::uuid
        AND jep.source_transaction_type = 'customer_payment'
        AND jep.source_transaction_id = $1::text
      ORDER BY je.id, je.entry_date DESC, jep.line_sequence ASC
    `,
    [paymentId, operatingCompanyId]
  );

  return {
    ...payment,
    applications: applicationsRes.rows,
    journal_entries: journalEntriesRes.rows,
  };
}

// ACCT-F5584: POST /payments (create) had no role gate at all -- currentAuthUser only requires a
// session. This route is a duplicate write path to customer-payments.routes.ts's POST /:id/payments
// (ACCT-F5581, already fixed) -- same INSERT into accounting.payments, same real GL posting via
// postSourceTransactionInClientTx (the route's own CLS-SUBLEDGER-GL-DARK comment calls this
// "instance 2" of the identical dark-GL defect). The sibling POST /:id/void route in THIS SAME FILE
// already correctly gates with requireVoidCancelExecutor -- create was simply missed. Reuses the
// same canVoidCancel predicate (Owner/Administrator/Accountant).
function requirePaymentWriteRole(reply: FastifyReply, role: string) {
  if (!canVoidCancel(role)) {
    reply.code(403).send({ error: "forbidden", detail: "recording a payment requires an accounting role" });
    return false;
  }
  return true;
}

export async function registerPaymentsRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/payments", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const q = query.data;

    const payload = await withCompanyScope(user.uuid, q.operating_company_id, async (client) => {
      const where: string[] = ["p.operating_company_id = $1::uuid"];
      const values: unknown[] = [q.operating_company_id];

      if (q.status === "active") where.push("p.voided_at IS NULL");
      if (q.status === "voided") where.push("p.voided_at IS NOT NULL");
      if (q.customer_id) {
        values.push(q.customer_id);
        where.push(`p.customer_id = $${values.length}`);
      }
      if (q.payment_method) {
        values.push(q.payment_method);
        where.push(`p.payment_method = $${values.length}`);
      }
      if (q.date_from) {
        values.push(q.date_from);
        where.push(`p.payment_date >= $${values.length}::date`);
      }
      if (q.date_to) {
        values.push(q.date_to);
        where.push(`p.payment_date <= $${values.length}::date`);
      }
      if (q.search) {
        values.push(`%${q.search}%`);
        const idx = values.length;
        where.push(`(p.display_id ILIKE $${idx} OR c.customer_name ILIKE $${idx})`);
      }

      const countRes = await client.query(
        `
          SELECT COUNT(*)::int AS total
          FROM accounting.payments p
          JOIN mdata.customers c
            ON c.id = p.customer_id
           AND c.operating_company_id = p.operating_company_id
           AND c.operating_company_id = $1::uuid
          WHERE ${where.join(" AND ")}
        `,
        values
      );

      values.push(q.limit);
      values.push(q.offset);
      const limitIdx = values.length - 1;
      const offsetIdx = values.length;

      const rowsRes = await client.query(
        `
          SELECT
            p.*,
            c.customer_name,
            ${PAYMENT_MATCHED_BANK_TRANSACTION_ID_SQL} AS matched_bank_transaction_id,
            bt.transaction_date AS matched_bank_transaction_date,
            bt.description AS matched_bank_transaction_description,
            bt.amount_cents::text AS matched_bank_transaction_amount_cents
          FROM accounting.payments p
          JOIN mdata.customers c
            ON c.id = p.customer_id
           AND c.operating_company_id = p.operating_company_id
           AND c.operating_company_id = $1::uuid
          LEFT JOIN banking.bank_transactions bt
            ON bt.id = ${PAYMENT_MATCHED_BANK_TRANSACTION_ID_SQL}::uuid
           AND bt.operating_company_id = p.operating_company_id
          WHERE ${where.join(" AND ")}
          ORDER BY p.payment_date DESC, p.created_at DESC
          LIMIT $${limitIdx}
          OFFSET $${offsetIdx}
        `,
        values
      );

      return {
        rows: rowsRes.rows,
        total: Number(countRes.rows[0]?.total ?? 0),
      };
    });

    return payload;
  });

  app.get("/api/v1/accounting/payments/:id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const detail = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      return fetchPaymentDetail(client, params.data.id, query.data.operating_company_id);
    });

    if (!detail) return reply.code(404).send({ error: "payment_not_found" });
    return detail;
  });

  app.post("/api/v1/accounting/payments", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!requirePaymentWriteRole(reply, String(user.role ?? ""))) return;

    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = createBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const sumApplied = (body.data.apply_to ?? []).reduce((sum, row) => sum + Number(row.amount_cents ?? 0), 0);
    if (sumApplied > body.data.amount_cents) {
      return reply.code(400).send({ error: "payment_apply_exceeds_total" });
    }

    const duplicateIds = new Set<string>();
    for (const row of body.data.apply_to ?? []) {
      if (duplicateIds.has(row.invoice_id)) return reply.code(400).send({ error: "duplicate_invoice_in_apply_to" });
      duplicateIds.add(row.invoice_id);
    }

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const customerRes = await client.query(
        `
          SELECT id
          FROM mdata.customers
          WHERE id = $1
            AND operating_company_id = $2::uuid
          LIMIT 1
        `,
        [body.data.customer_id, query.data.operating_company_id]
      );
      if (!customerRes.rows[0]) return { code: 404 as const, error: "customer_not_found" };

      // Deposit-to must be a catalogs.accounts UUID for this entity (GL cash/bank/UF). Never a
      // free-text bank slug — posting treats the value as catalogs.accounts.id.
      let depositedToAccountId = body.data.deposited_to_account_id ?? null;
      if (depositedToAccountId) {
        const acct = await client.query(
          `
            SELECT id::text AS id
            FROM catalogs.accounts
            WHERE id = $1::uuid
              AND operating_company_id = $2::uuid
              AND deactivated_at IS NULL
            LIMIT 1
          `,
          [depositedToAccountId, query.data.operating_company_id]
        );
        if (!acct.rows[0]) return { code: 400 as const, error: "deposited_to_account_not_found" };
      } else {
        depositedToAccountId =
          (await resolveRoleAccountOptional(client, query.data.operating_company_id, "undeposited_funds")) ??
          (await resolveRoleAccountOptional(client, query.data.operating_company_id, "cash_clearing"));
        if (!depositedToAccountId) return { code: 400 as const, error: "deposited_to_account_required" };
      }

      const displayId = await nextPaymentDisplayId(client, query.data.operating_company_id, new Date(`${body.data.payment_date}T00:00:00.000Z`));

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
            -- ACCT-F353 — this route never wrote the sample tag at all; posting-engine resolves it
            -- from this SOURCE row, so an untagged payment yielded an untagged journal entry.
            is_sample_data
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
          RETURNING id, display_id, amount_unapplied_cents
        `,
        [
          query.data.operating_company_id,
          body.data.customer_id,
          displayId,
          body.data.payment_method,
          body.data.payment_date,
          body.data.reference ?? null,
          body.data.amount_cents,
          depositedToAccountId,
          body.data.notes ?? null,
          user.uuid,
          // only an explicit true marks sample; omitting it keeps the column's false default.
          body.data.is_sample_data === true,
        ]
      );
      const payment = paymentRes.rows[0] as { id: string; display_id: string; amount_unapplied_cents: number } | undefined;
      if (!payment?.id) return { code: 500 as const, error: "payment_create_failed" };
      // Option B inc 2: link create-time draft attachments (check/ACH/wire confirmations) to the real
      // payment id, atomically in this txn.
      await reassignDraftAttachments(client, {
        operatingCompanyId: query.data.operating_company_id,
        entityType: "payment",
        draftId: body.data.attachment_draft_id,
        newId: payment.id,
      });

      let applicationsCount = 0;
      for (const applyRow of body.data.apply_to ?? []) {
        const invoiceRes = await client.query(
          `
            SELECT id, amount_open_cents, status
            FROM accounting.invoices
            WHERE id = $1
              AND operating_company_id = $2::uuid
              AND customer_id = $3
            LIMIT 1
          `,
          [applyRow.invoice_id, query.data.operating_company_id, body.data.customer_id]
        );
        const invoice = invoiceRes.rows[0] as { id: string; amount_open_cents: number; status: string } | null;
        if (!invoice) return { code: 404 as const, error: "invoice_not_found_for_payment_customer" };
        if (!["sent", "partial"].includes(String(invoice.status))) return { code: 409 as const, error: "invoice_not_open_for_payment" };
        if (Number(applyRow.amount_cents) > Number(invoice.amount_open_cents ?? 0)) return { code: 400 as const, error: "apply_amount_exceeds_invoice_open" };

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

      // CLS-SUBLEDGER-GL-DARK / ACCT-F150 instance 2 — POST THE RECEIPT.
      //
      // Second live instance of the same class, on a DIFFERENT write path. customer-payments.routes.ts
      // was the one found from a live $250 USMCA payment; this route has the identical shape — it
      // INSERTs accounting.payments and accounting.payment_applications in one transaction, so A/R
      // moves here too, and it never invoked the poster. Both routes were dark for the same reason:
      // apply.service.ts was hardened for exactly this and the ROUTES were never wired to it.
      //
      // Same gate, same skip-audit, same poster as the sibling route — no new GL math (locked rule:
      // reuse the existing poster). Flag OFF still writes the payment and applications and records the
      // skip append-only, so a skip can never read as a silent success.
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
          context: { payment_id: payment.id, route: "POST /api/v1/accounting/payments" },
        });
      }

      const refreshedRes = await client.query(
        `SELECT amount_unapplied_cents FROM accounting.payments WHERE id = $1 LIMIT 1`,
        [payment.id]
      );
      const refreshed = refreshedRes.rows[0] ?? { amount_unapplied_cents: 0 };

      await appendCrudAudit(
        client,
        user.uuid,
        "accounting.payment_recorded",
        {
          resource_type: "accounting.payments",
          resource_id: payment.id,
          operating_company_id: query.data.operating_company_id,
          customer_id: body.data.customer_id,
          display_id: payment.display_id,
          applications_count: applicationsCount,
        },
        "info",
        "P3-T11.20.3-PAYMENT-RECORDING"
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
        event_type: "payment.created",
        entity_id: (result as { data?: { id?: string } })?.data?.id ?? "",
        entity_type: "payment",
        source_table: "accounting.payments",
      })
    ).catch((err) =>
      req.log.warn(
        {
          err,
          payment_id: (result as { data?: { id?: string } })?.data?.id ?? null,
          company_id: query.data.operating_company_id,
        },
        "spine_emit_payment_created_failed"
      )
    );
    return reply.code(result.code).send(result.data);
  });

  app.post("/api/v1/accounting/payments/:id/void", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    // G9-C3: voiding a financial record is an EXECUTOR-only action (Owner|Administrator|Accountant).
    // Route through the shared governance authz — OUTSIDE any feature flag — so anyone else must FILE a
    // void/cancel request for approval. Non-executors get the canonical 403 here.
    if (!requireVoidCancelExecutor(reply, String(user.role ?? ""))) return;

    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = voidBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      // ACCT-F5026 — payment_date::text alias (same LV-BILLVOID class as bill void). SELECT *
      // hands node-postgres a JS Date; String(date).slice(0,10) → "Thu Aug 06" → ::date 500.
      const paymentRes = await client.query(
        `
          SELECT *,
                 payment_date::text AS payment_date_iso
          FROM accounting.payments
          WHERE id = $1
            AND operating_company_id = $2::uuid
          LIMIT 1
        `,
        [params.data.id, query.data.operating_company_id]
      );
      const payment = paymentRes.rows[0] ?? null;
      if (!payment) return { code: 404 as const, error: "payment_not_found" };
      if (payment.voided_at) return { code: 409 as const, error: "payment_already_voided" };

      await client.query(
        `
          UPDATE accounting.payments
          SET voided_at = now(),
              voided_by_user_id = $2,
              void_reason = $3
          WHERE id = $1
        `,
        [params.data.id, user.uuid, body.data.void_reason]
      );

      // INV-2: void-never-delete — archive all applications when voiding; never hard-delete.
      await client.query(
        `UPDATE accounting.payment_applications SET unapplied_at = now(), unapplied_by_user_id = $2 WHERE payment_id = $1 AND unapplied_at IS NULL`,
        [params.data.id, user.uuid]
      );

      // ACCT-F151 — REVERSE THE RECEIPT IN THE GL ON VOID.
      //
      // The other half of the same defect, and it only becomes reachable once the create path above
      // posts. Voiding set voided_at and unapplied every application — the SUBLEDGER correctly
      // released the cash from the invoice — while the receipt's journal entry stayed in the ledger
      // untouched. Posting the initial receipt without this would be strictly worse than posting
      // nothing: every voided payment would permanently understate A/R by its own amount, and both
      // sides would look right in isolation (the payment reads voided, the JE reads balanced).
      //
      // postVoidReversal reads the ORIGINAL postings by source_transaction_type and flips them —
      // no new GL math, and it already accepts 'customer_payment' as a VoidableEntityType. It returns
      // reversal_journal_entry_id: null when the payment has no GL postings at all, which is exactly
      // the right behaviour for every payment recorded BEFORE this fix and for a payment written
      // while the flag was OFF: nothing to reverse, so nothing is invented.
      //
      // Reversal DATE is resolved by the shared grounded rule, not by this route: original period
      // open -> reverse at the original date; original period CLOSED -> reverse in the current open
      // period, never rewriting a closed period.
      const voidReversal = await postVoidReversal(
        client,
        {
          operatingCompanyId: query.data.operating_company_id,
          entityType: "customer_payment",
          entityId: params.data.id,
          originalDate: pgDateColumnToIsoDay(
            (payment as { payment_date_iso?: string | null }).payment_date_iso ?? payment.payment_date
          ),
          memo: `Void reversal: payment ${payment.display_id ?? params.data.id}`,
        },
        { userId: user.uuid }
      );

      await appendCrudAudit(
        client,
        user.uuid,
        "accounting.payment_voided",
        {
          resource_type: "accounting.payments",
          resource_id: params.data.id,
          operating_company_id: query.data.operating_company_id,
          void_reason: body.data.void_reason,
          reversal_journal_entry_id: voidReversal.reversal_journal_entry_id,
          reversal_date: voidReversal.reversal_date,
          closed_period_reversal: voidReversal.closed_period_reversal,
          reversed_line_count: voidReversal.reversed_line_count,
        },
        "warning",
        "P3-T11.20.3-PAYMENT-RECORDING"
      );

      const detail = await fetchPaymentDetail(client, params.data.id, query.data.operating_company_id);
      return { code: 200 as const, data: detail };
    });

    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    void withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
      emitAccountingSpineEvent(client, {
        operating_company_id: query.data.operating_company_id,
        actor_user_id: String(user.uuid),
        event_type: "payment.voided",
        entity_id: params.data.id,
        entity_type: "payment",
        source_table: "accounting.payments",
        payload: { void_reason: body.data.void_reason ?? null },
      })
    ).catch((err) =>
      req.log.warn(
        { err, payment_id: params.data.id, company_id: query.data.operating_company_id },
        "spine_emit_payment_voided_failed"
      )
    );
    return result.data;
  });
}


export default fp(async (app) => {
  await registerPaymentsRoutes(app);
}, { name: "accounting.registerPaymentsRoutes" });
