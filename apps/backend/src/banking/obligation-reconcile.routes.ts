import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser, withSavepoint } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { normalizeBankTransactionDescription } from "./bank-tx-dedup.js";
import { suggestionConfidence } from "./obligation-reconcile.logic.js";
import { appendFactoringSuggestions } from "./recon.service.js";
import { FactoringBankMatchError, applyMatch } from "../factoring/bank-match.service.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const unmatchedQuerySchema = companyQuerySchema.extend({
  bank_account_id: z.string().uuid().optional(),
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional(),
  amount_min_cents: z.coerce.number().int().optional(),
  amount_max_cents: z.coerce.number().int().optional(),
});

const obligationsQuerySchema = companyQuerySchema.extend({
  bank_account_id: z.string().uuid().optional(),
});

const suggestionsQuerySchema = companyQuerySchema.extend({
  bank_transaction_id: z.string().uuid(),
});

const reconcileBodySchema = z.object({
  bank_transaction_id: z.string().uuid(),
  obligation_type: z.enum(["load", "settlement", "fuel", "work_order", "ar_invoice", "bill", "factoring_batch"]),
  obligation_id: z.string().uuid(),
});

const bulkBodySchema = z.object({
  bank_transaction_ids: z.array(z.string().uuid()).min(1).max(200),
  action: z.enum(["mark_reviewed", "categorize_fuel", "categorize_insurance", "categorize_transfer"]),
});

type ReconciliationRole = "Owner" | "Administrator" | "Accountant";
const RECON_ROLES = new Set<ReconciliationRole>(["Owner", "Administrator", "Accountant"]);

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function canReconcile(role: string): role is ReconciliationRole {
  return RECON_ROLES.has(role as ReconciliationRole);
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }> }) => Promise<T>
) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    return fn(client);
  });
}

type ObligationRow = {
  obligation_type: z.infer<typeof reconcileBodySchema.shape.obligation_type>;
  obligation_id: string;
  label: string;
  amount_cents: number;
  event_date: string;
};

async function loadObligationCandidates(
  client: { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> },
  companyId: string
): Promise<ObligationRow[]> {
  const out: ObligationRow[] = [];

  const loads = await withSavepoint(
    client,
    "obligation_reconcile_loads",
    () =>
      client.query<{ id: string; load_number: string | null; rate_total_cents: number | null; created_at: string }>(
        `
        SELECT id, load_number, rate_total_cents, created_at::text
        FROM mdata.loads
        WHERE operating_company_id = $1::uuid
          AND soft_deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT 400
      `,
        [companyId]
      ),
    { rows: [] }
  );
  for (const r of loads.rows) {
    out.push({
      obligation_type: "load",
      obligation_id: r.id,
      label: `Load ${r.load_number ?? r.id.slice(0, 8)}`,
      amount_cents: Math.abs(Math.round(Number(r.rate_total_cents ?? 0))),
      event_date: String(r.created_at).slice(0, 10),
    });
  }

  // ACCT-F5607 — this SELECT read a phantom `net_settlement_cents` column (never existed on
  // driver_finance.driver_settlements). withSavepoint's catch-all swallowed the resulting 42703 and
  // returned its `{ rows: [] }` fallback, so this screen has silently shown ZERO settlement
  // obligations since it shipped, indistinguishable from "nothing to reconcile." The real column is
  // `net_pay`, numeric DOLLARS (confirmed live: e.g. "1705.55"), not cents — the same units trap
  // transaction-register.routes.ts's own header comment already documents for this exact column
  // ("fuel.total_cost and settlement.net_pay are numeric DOLLARS -> *100 (no 10x bug)"). Converted
  // the same way the fuel block two paragraphs below this one already does it correctly in this same
  // file (Math.round(dollars * 100)), for consistency within the file.
  const st = await withSavepoint(
    client,
    "obligation_reconcile_settlements",
    () =>
      client.query<{ id: string; net_pay: unknown; created_at: string }>(
        `
        SELECT id, net_pay, created_at::text
        FROM driver_finance.driver_settlements
        WHERE operating_company_id = $1::uuid
        ORDER BY created_at DESC
        LIMIT 200
      `,
        [companyId]
      ),
    { rows: [] }
  );
  for (const r of st.rows) {
    out.push({
      obligation_type: "settlement",
      obligation_id: r.id,
      label: `Settlement ${r.id.slice(0, 8)}`,
      amount_cents: Math.abs(Math.round(Number(r.net_pay ?? 0) * 100)),
      event_date: String(r.created_at).slice(0, 10),
    });
  }

  const fuel = await withSavepoint(
    client,
    "obligation_reconcile_fuel",
    () =>
      client.query<{ id: string; total_cost: unknown; purchased_at: string | null }>(
        `
        SELECT id, total_cost, purchased_at::text
        FROM fuel.fuel_transactions
        WHERE operating_company_id = $1::uuid
        ORDER BY purchased_at DESC NULLS LAST
        LIMIT 200
      `,
        [companyId]
      ),
    { rows: [] }
  );
  for (const r of fuel.rows) {
    const cents = Math.round(Number(r.total_cost ?? 0) * 100);
    out.push({
      obligation_type: "fuel",
      obligation_id: r.id,
      label: `Fuel ${r.id.slice(0, 8)}`,
      amount_cents: Math.abs(cents),
      event_date: (r.purchased_at ?? new Date().toISOString()).slice(0, 10),
    });
  }

  const wos = await withSavepoint(
    client,
    "obligation_reconcile_work_orders",
    () =>
      client.query<{ id: string; description: string | null; total_actual_cost: unknown; opened_at: string | null }>(
        `
        SELECT id, description, total_actual_cost, opened_at::text
        FROM maintenance.work_orders
        WHERE operating_company_id = $1::uuid
        ORDER BY opened_at DESC NULLS LAST
        LIMIT 200
      `,
        [companyId]
      ),
    { rows: [] }
  );
  for (const r of wos.rows) {
    const cents = Math.round(Number(r.total_actual_cost ?? 0) * 100);
    out.push({
      obligation_type: "work_order",
      obligation_id: r.id,
      label: r.description?.slice(0, 80) || `Work order ${r.id.slice(0, 8)}`,
      amount_cents: Math.abs(cents),
      event_date: (r.opened_at ?? new Date().toISOString()).slice(0, 10),
    });
  }

  const inv = await withSavepoint(
    client,
    "obligation_reconcile_invoices",
    () =>
      client.query<{ id: string; display_id: string; total_cents: number | null; issue_date: string }>(
        `
        SELECT id, display_id, total_cents, issue_date::text
        FROM accounting.invoices
        WHERE operating_company_id = $1::uuid
          AND status NOT IN ('void', 'draft')
        ORDER BY issue_date DESC
        LIMIT 200
      `,
        [companyId]
      ),
    { rows: [] }
  );
  for (const r of inv.rows) {
    out.push({
      obligation_type: "ar_invoice",
      obligation_id: r.id,
      label: `Invoice ${r.display_id}`,
      amount_cents: Math.abs(Math.round(Number(r.total_cents ?? 0))),
      event_date: String(r.issue_date).slice(0, 10),
    });
  }

  const bills = await withSavepoint(
    client,
    "obligation_reconcile_bills",
    () =>
      client.query<{ id: string; bill_number: string | null; memo: string | null; amount_cents: number | null; bill_date: string }>(
        `
        SELECT id, bill_number, memo, amount_cents, bill_date::text
        FROM accounting.bills
        WHERE operating_company_id = $1::uuid
          AND revoked_at IS NULL
        ORDER BY bill_date DESC NULLS LAST
        LIMIT 200
      `,
        [companyId]
      ),
    { rows: [] }
  );
  for (const r of bills.rows) {
    out.push({
      obligation_type: "bill",
      obligation_id: r.id,
      label: r.bill_number?.slice(0, 80) || r.memo?.slice(0, 80) || `Bill ${r.id.slice(0, 8)}`,
      amount_cents: Math.abs(Math.round(Number(r.amount_cents ?? 0))),
      event_date: String(r.bill_date).slice(0, 10),
    });
  }

  return out;
}

// ACCT-F5573: table + extra predicate for each obligation_type, so POST /reconcile can verify the
// caller-supplied obligation_id actually exists and belongs to this company BEFORE writing it onto
// a real bank transaction. Mirrors loadObligationCandidates' own WHERE predicates exactly.
const OBLIGATION_EXISTENCE_SQL: Record<z.infer<typeof reconcileBodySchema.shape.obligation_type>, string | null> = {
  load: `SELECT 1 FROM mdata.loads WHERE id = $1::uuid AND operating_company_id = $2::uuid AND soft_deleted_at IS NULL`,
  settlement: `SELECT 1 FROM driver_finance.driver_settlements WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
  fuel: `SELECT 1 FROM fuel.fuel_transactions WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
  work_order: `SELECT 1 FROM maintenance.work_orders WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
  ar_invoice: `SELECT 1 FROM accounting.invoices WHERE id = $1::uuid AND operating_company_id = $2::uuid AND status NOT IN ('void', 'draft')`,
  bill: `SELECT 1 FROM accounting.bills WHERE id = $1::uuid AND operating_company_id = $2::uuid AND revoked_at IS NULL`,
  // factoring_batch is validated by applyMatch() itself, not this table-existence check.
  factoring_batch: null,
};

function isUnreconciledTxnRow(row: {
  matched_load_id: string | null;
  matched_bill_id: string | null;
  matched_settlement_id: string | null;
  reconciled_obligation_id: string | null;
}) {
  return (
    !row.reconciled_obligation_id &&
    !row.matched_load_id &&
    !row.matched_bill_id &&
    !row.matched_settlement_id
  );
}

export async function registerBankingObligationReconcileRoutes(app: FastifyInstance) {
  app.get("/api/v1/banking/reconcile/unmatched-transactions", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canReconcile(user.role)) return reply.code(403).send({ error: "forbidden" });

    const q = unmatchedQuerySchema.safeParse(req.query ?? {});
    if (!q.success) return sendValidationError(reply, q.error);

    const rows = await withCompanyScope(user.uuid, q.data.operating_company_id, async (client) => {
      const filters: string[] = ["operating_company_id = $1::uuid"];
      const vals: unknown[] = [q.data.operating_company_id];
      let i = 2;
      if (q.data.bank_account_id) {
        filters.push(`bank_account_id = $${i}`);
        vals.push(q.data.bank_account_id);
        i += 1;
      }
      if (q.data.date_from) {
        filters.push(`transaction_date >= $${i}::date`);
        vals.push(q.data.date_from);
        i += 1;
      }
      if (q.data.date_to) {
        filters.push(`transaction_date <= $${i}::date`);
        vals.push(q.data.date_to);
        i += 1;
      }
      if (q.data.amount_min_cents != null) {
        filters.push(`amount_cents >= $${i}`);
        vals.push(q.data.amount_min_cents);
        i += 1;
      }
      if (q.data.amount_max_cents != null) {
        filters.push(`amount_cents <= $${i}`);
        vals.push(q.data.amount_max_cents);
        i += 1;
      }

      const res = await client.query(
        `
          SELECT
            id,
            bank_account_id,
            transaction_date::text,
            amount_cents,
            description,
            merchant_name,
            is_credit,
            matched_load_id,
            matched_bill_id,
            matched_settlement_id,
            reconciled_obligation_type,
            reconciled_obligation_id,
            reviewed_at::text,
            status,
            category
          FROM banking.bank_transactions
          WHERE ${filters.join(" AND ")}
            AND reconciled_obligation_id IS NULL
            AND matched_load_id IS NULL
            AND matched_bill_id IS NULL
            AND matched_settlement_id IS NULL
          ORDER BY transaction_date DESC, created_at DESC
          LIMIT 500
        `,
        vals
      );
      return res.rows;
    });

    return { transactions: rows };
  });

  app.get("/api/v1/banking/reconcile/obligations", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canReconcile(user.role)) return reply.code(403).send({ error: "forbidden" });

    const q = obligationsQuerySchema.safeParse(req.query ?? {});
    if (!q.success) return sendValidationError(reply, q.error);

    const payload = await withCompanyScope(user.uuid, q.data.operating_company_id, async (client) => {
      const candidates = await loadObligationCandidates(client, q.data.operating_company_id);
      const unmatched = candidates;
      return { obligations: unmatched };
    });

    return payload;
  });

  app.get("/api/v1/banking/reconcile/suggestions", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canReconcile(user.role)) return reply.code(403).send({ error: "forbidden" });

    const q = suggestionsQuerySchema.safeParse(req.query ?? {});
    if (!q.success) return sendValidationError(reply, q.error);

    const payload = await withCompanyScope(user.uuid, q.data.operating_company_id, async (client) => {
      const txnRes = await client.query<{
        id: string;
        amount_cents: number;
        transaction_date: string;
        description: string | null;
        merchant_name: string | null;
        matched_load_id: string | null;
        matched_bill_id: string | null;
        matched_settlement_id: string | null;
        reconciled_obligation_id: string | null;
      }>(
        `
          SELECT
            id,
            amount_cents::int,
            transaction_date::text,
            description,
            merchant_name,
            matched_load_id,
            matched_bill_id,
            matched_settlement_id,
            reconciled_obligation_id
          FROM banking.bank_transactions
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
          LIMIT 1
        `,
        [q.data.bank_transaction_id, q.data.operating_company_id]
      );
      const txn = txnRes.rows[0] ?? null;
      if (!txn) return { error: "not_found" as const };
      if (!isUnreconciledTxnRow(txn)) return { error: "already_reconciled" as const };

      const descBase = normalizeBankTransactionDescription(
        [txn.description, txn.merchant_name].filter(Boolean).join(" ") || "transaction"
      );
      const candidates = await loadObligationCandidates(client, q.data.operating_company_id);
      const scored: Array<ObligationRow & { confidence: number; lev: number; suggestion_source: "obligation" }> = [];
      for (const c of candidates) {
        const oblDesc = normalizeBankTransactionDescription(c.label);
        const { passes, score, lev } = suggestionConfidence({
          amountCentsTxn: Math.abs(Number(txn.amount_cents)),
          amountCentsObl: c.amount_cents,
          dateTxn: txn.transaction_date.slice(0, 10),
          dateObl: c.event_date,
          descTxn: descBase,
          descObl: oblDesc,
        });
        if (!passes) continue;
        scored.push({ ...c, confidence: score, lev, suggestion_source: "obligation" });
      }
      scored.sort((a, b) => b.confidence - a.confidence);
      const suggestions = await appendFactoringSuggestions({
        client,
        operating_company_id: q.data.operating_company_id,
        bank_transaction_id: q.data.bank_transaction_id,
        baseSuggestions: scored.slice(0, 3),
      });
      return { suggestions };
    });

    if ("error" in payload && payload.error === "not_found") return reply.code(404).send({ error: "transaction_not_found" });
    if ("error" in payload && payload.error === "already_reconciled") return reply.code(409).send({ error: "already_reconciled" });

    return payload;
  });

  app.post("/api/v1/banking/reconcile", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canReconcile(user.role)) return reply.code(403).send({ error: "forbidden" });

    const body = reconcileBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const companyHeader = companyQuerySchema.safeParse(req.query ?? {});
    if (!companyHeader.success) return sendValidationError(reply, companyHeader.error);
    const companyId = companyHeader.data.operating_company_id;

    let ok: boolean | "transaction_mismatch" | "obligation_not_found";
    try {
      ok = await withCompanyScope(user.uuid, companyId, async (client) => {
        await client.query("BEGIN");
        try {
          const lockRes = await client.query<{ id: string }>(
          `
            SELECT id FROM banking.bank_transactions
            WHERE id = $1::uuid AND operating_company_id = $2::uuid
            FOR UPDATE
          `,
          [body.data.bank_transaction_id, companyId]
        );
          if (!lockRes.rows[0]) {
            await client.query("ROLLBACK");
            return false;
          }

          if (body.data.obligation_type === "factoring_batch") {
            const applied = await applyMatch(body.data.obligation_id, companyId, { client });
            if (applied.bank_txn_id !== body.data.bank_transaction_id) {
              await client.query("ROLLBACK");
              return "transaction_mismatch" as const;
            }

            await appendCrudAudit(
              client,
              user.uuid,
              "banking.obligation_reconcile.applied",
              {
                resource_type: "banking.bank_transactions",
                resource_id: body.data.bank_transaction_id,
                obligation_type: body.data.obligation_type,
                obligation_id: applied.batch_id,
                bank_match_suggestion_id: body.data.obligation_id,
              },
              "info",
              "P7-BLOCK-K-RECON"
            );
            await client.query("COMMIT");
            return true;
          }

          // ACCT-F5573: the obligation_id was previously written straight onto the bank transaction
          // with no check that it exists or belongs to this company. Every downstream JOIN on
          // matched_load_id/matched_bill_id/matched_settlement_id is itself company-scoped (verified:
          // plaid/link.routes.ts, qbo-sync.service.ts), so a bogus/foreign id can't leak another
          // tenant's data through those reads -- but it silently marks a REAL bank transaction as
          // "matched" against nothing, permanently hiding a genuinely-unreconciled transaction from
          // the /unmatched-transactions queue (which filters on matched_*/reconciled_obligation_id
          // being NULL). Reject before writing instead of trusting the caller.
          const existenceSql = OBLIGATION_EXISTENCE_SQL[body.data.obligation_type];
          if (existenceSql) {
            const existsRes = await client.query(existenceSql, [body.data.obligation_id, companyId]);
            if (!existsRes.rows[0]) {
              await client.query("ROLLBACK");
              return "obligation_not_found" as const;
            }
          }

          let loadId: string | null = null;
          let billId: string | null = null;
          let settlementId: string | null = null;
          let linkedId: string | null = null;
          let categoryKind: string | null = null;

          if (body.data.obligation_type === "load") loadId = body.data.obligation_id;
          if (body.data.obligation_type === "bill") billId = body.data.obligation_id;
          if (body.data.obligation_type === "settlement") settlementId = body.data.obligation_id;
          if (body.data.obligation_type === "fuel" || body.data.obligation_type === "work_order" || body.data.obligation_type === "ar_invoice") {
            linkedId = body.data.obligation_id;
            categoryKind = body.data.obligation_type === "ar_invoice" ? "invoice" : body.data.obligation_type;
          }

          await client.query(
          `
            UPDATE banking.bank_transactions
            SET
              reconciled_obligation_type = $2::text,
              reconciled_obligation_id = $3::uuid,
              matched_load_id = COALESCE($4::uuid, matched_load_id),
              matched_bill_id = COALESCE($5::uuid, matched_bill_id),
              matched_settlement_id = COALESCE($6::uuid, matched_settlement_id),
              linked_entity_id = COALESCE($7::uuid, linked_entity_id),
              category_kind = COALESCE($8::text, category_kind),
              updated_at = now()
            WHERE id = $1::uuid
          `,
          [
            body.data.bank_transaction_id,
            body.data.obligation_type,
            body.data.obligation_id,
            loadId,
            billId,
            settlementId,
            linkedId,
            categoryKind,
          ]
        );

          await appendCrudAudit(
          client,
          user.uuid,
          "banking.obligation_reconcile.applied",
          {
            resource_type: "banking.bank_transactions",
            resource_id: body.data.bank_transaction_id,
            obligation_type: body.data.obligation_type,
            obligation_id: body.data.obligation_id,
          },
          "info",
          "P7-BLOCK-K-RECON"
        );
          await client.query("COMMIT");
          return true;
        } catch (e) {
          await client.query("ROLLBACK");
          throw e;
        }
      });
    } catch (error) {
      if (error instanceof FactoringBankMatchError) {
        return reply.code(error.statusCode).send({ error: error.code });
      }
      throw error;
    }

    if (ok === "transaction_mismatch") return reply.code(409).send({ error: "suggestion_transaction_mismatch" });
    if (ok === "obligation_not_found") return reply.code(404).send({ error: "obligation_not_found" });
    if (!ok) return reply.code(404).send({ error: "transaction_not_found" });
    return { ok: true };
  });

  app.post("/api/v1/banking/reconcile/bulk", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canReconcile(user.role)) return reply.code(403).send({ error: "forbidden" });

    const body = bulkBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const companyHeader = companyQuerySchema.safeParse(req.query ?? {});
    if (!companyHeader.success) return sendValidationError(reply, companyHeader.error);
    const companyId = companyHeader.data.operating_company_id;

    const updated = await withCompanyScope(user.uuid, companyId, async (client) => {
      if (body.data.action === "mark_reviewed") {
        const res = await client.query(
          `
            UPDATE banking.bank_transactions
            SET reviewed_at = now(), updated_at = now()
            WHERE operating_company_id = $1::uuid
              AND id = ANY($2::uuid[])
            RETURNING id
          `,
          [companyId, body.data.bank_transaction_ids]
        );
        return res.rows.length;
      }
      if (body.data.action === "categorize_fuel") {
        const res = await client.query(
          `
            UPDATE banking.bank_transactions
            SET category = 'Fuel',
                category_kind = 'fuel',
                status = 'categorized',
                categorized_at = now(),
                updated_at = now()
            WHERE operating_company_id = $1::uuid
              AND id = ANY($2::uuid[])
            RETURNING id
          `,
          [companyId, body.data.bank_transaction_ids]
        );
        return res.rows.length;
      }
      if (body.data.action === "categorize_insurance") {
        const res = await client.query(
          `
            UPDATE banking.bank_transactions
            SET category = 'Insurance',
                category_kind = 'expense',
                status = 'categorized',
                categorized_at = now(),
                updated_at = now()
            WHERE operating_company_id = $1::uuid
              AND id = ANY($2::uuid[])
            RETURNING id
          `,
          [companyId, body.data.bank_transaction_ids]
        );
        return res.rows.length;
      }
      const res = await client.query(
        `
          UPDATE banking.bank_transactions
          SET category = 'Transfer',
              category_kind = 'transfer',
              status = 'categorized',
              categorized_at = now(),
              updated_at = now()
          WHERE operating_company_id = $1::uuid
            AND id = ANY($2::uuid[])
          RETURNING id
        `,
        [companyId, body.data.bank_transaction_ids]
      );
      return res.rows.length;
    });

    await withCompanyScope(user.uuid, companyId, async (client) => {
      await appendCrudAudit(
        client,
        user.uuid,
        "banking.reconcile.bulk",
        {
          action: body.data.action,
          count: updated,
          ids: body.data.bank_transaction_ids,
        },
        "info",
        "P7-BLOCK-K-RECON"
      );
      return null;
    });

    return { ok: true, updated_count: updated };
  });
}
