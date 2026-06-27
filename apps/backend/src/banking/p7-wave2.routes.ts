import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";
import { BankingRuleRow, mergeSuggestionPreferHigher, suggestionFromPlaidCategory, suggestionFromRules } from "./suggestion-engine.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const financeRoles = new Set(["Owner", "Administrator", "Manager", "Accountant"]);

function financeUser(req: Parameters<typeof currentAuthUser>[0], reply: Parameters<typeof currentAuthUser>[1]) {
  const user = currentAuthUser(req, reply);
  if (!user) return null;
  if (!financeRoles.has(String(user.role))) {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return user as { uuid: string; role: string };
}

export async function registerBankingP7Wave2Routes(app: FastifyInstance) {
  const reviewQuery = companyQuerySchema.extend({
    state: z.enum(["for_review", "categorized", "excluded", "matched", "transfer"]).optional(),
    account_id: z.string().uuid().optional(),
    date_start: z.string().optional(),
    date_end: z.string().optional(),
    search: z.string().optional(),
    cursor: z.coerce.number().int().min(0).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  });

  app.get("/api/v1/banking/transactions/review", async (req, reply) => {
    const user = financeUser(req, reply);
    if (!user) return;

    const parsed = reviewQuery.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const q = parsed.data;

    const rows = await withCompanyScope(user.uuid, q.operating_company_id, async (client) => {
      await appendCrudAudit(client, user.uuid, "banking.txn_review_list", { operating_company_id: q.operating_company_id }, "info", "P7-W2-BANK");

      const rulesRes = await client.query(
        `SELECT priority, description_contains, description_regex, amount_min_cents, amount_max_cents,
                bank_account_filter_id, then_vendor_id, then_account_id, then_class_id
         FROM accounting.banking_rules
         WHERE operating_company_id = $1 AND is_active = true`,
        [q.operating_company_id]
      );
      const rules = rulesRes.rows as BankingRuleRow[];

      const params: unknown[] = [q.operating_company_id];
      let where = `bt.operating_company_id = $1`;
      if (q.state) {
        params.push(q.state);
        where += ` AND bt.review_state = $${params.length}`;
      }
      if (q.account_id) {
        params.push(q.account_id);
        where += ` AND bt.bank_account_id = $${params.length}`;
      }
      if (q.date_start) {
        params.push(q.date_start);
        where += ` AND bt.transaction_date >= $${params.length}::date`;
      }
      if (q.date_end) {
        params.push(q.date_end);
        where += ` AND bt.transaction_date <= $${params.length}::date`;
      }
      if (q.search?.trim()) {
        params.push(`%${q.search.trim()}%`);
        where += ` AND (bt.description ILIKE $${params.length} OR bt.merchant_name ILIKE $${params.length})`;
      }
      params.push(q.limit);
      params.push(q.cursor ?? 0);
      const lim = params.length - 1;
      const off = params.length;
      const res = await client.query(
        `
          SELECT bt.*, ba.account_name AS bank_account_name
          FROM banking.bank_transactions bt
          JOIN banking.bank_accounts ba ON ba.id = bt.bank_account_id
          WHERE ${where}
          ORDER BY bt.transaction_date DESC, bt.id DESC
          LIMIT $${lim} OFFSET $${off}
        `,
        params
      );
      return res.rows.map((row: Record<string, unknown>) => {
        const sug =
          mergeSuggestionPreferHigher(
            suggestionFromRules(rules, {
              description_normalized: row.description_normalized as string | null,
              amount_cents: Number(row.amount_cents),
              bank_account_id: String(row.bank_account_id),
            }),
            null
          ) ?? null;
        const plaid = suggestionFromPlaidCategory(Array.isArray(row.plaid_category) ? row.plaid_category[0] : null);
        const merged =
          plaid && sug
            ? mergeSuggestionPreferHigher(sug, {
                vendor_id: null,
                account_id: plaid.account_id,
                class_id: null,
                confidence: plaid.confidence,
                source: plaid.source,
              })
            : sug ??
              (plaid
                ? {
                    vendor_id: null,
                    account_id: plaid.account_id,
                    class_id: null,
                    confidence: plaid.confidence,
                    source: plaid.source,
                  }
                : null);

        return {
          ...row,
          suggestion: merged,
          match_candidates_count: 0,
        };
      });
    });

    return { items: rows, next_cursor: (q.cursor ?? 0) + rows.length };
  });

  app.get("/api/v1/banking/rules", async (req, reply) => {
    const user = financeUser(req, reply);
    if (!user) return;
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const rows = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const res = await client.query(`SELECT * FROM accounting.banking_rules WHERE operating_company_id = $1 ORDER BY priority DESC`, [
        parsed.data.operating_company_id,
      ]);
      return res.rows;
    });
    return { items: rows };
  });

  app.post("/api/v1/banking/rules", async (req, reply) => {
    const user = financeUser(req, reply);
    if (!user) return;

    const body = z
      .object({
        operating_company_id: z.string().uuid(),
        priority: z.coerce.number().int().optional().default(0),
        description_contains: z.string().optional(),
        description_regex: z.string().optional(),
        amount_min_cents: z.coerce.number().int().optional(),
        amount_max_cents: z.coerce.number().int().optional(),
        bank_account_filter_id: z.string().uuid().optional(),
        then_vendor_id: z.string().uuid().optional(),
        then_account_id: z.string().uuid(),
        then_class_id: z.string().uuid().optional(),
        then_memo_template: z.string().optional(),
      })
      .safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const id = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      const acct = await client.query(`SELECT id FROM catalogs.accounts WHERE id = $1 LIMIT 1`, [body.data.then_account_id]);
      if (!acct.rows[0]) {
        reply.code(400).send({ error: "unknown_account" });
        return null;
      }
      const ins = await client.query(
        `
          INSERT INTO accounting.banking_rules (
            operating_company_id, priority, description_contains, description_regex,
            amount_min_cents, amount_max_cents, bank_account_filter_id,
            then_vendor_id, then_account_id, then_class_id, then_memo_template,
            created_by_user_id
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::uuid)
          RETURNING id
        `,
        [
          body.data.operating_company_id,
          body.data.priority,
          body.data.description_contains ?? null,
          body.data.description_regex ?? null,
          body.data.amount_min_cents ?? null,
          body.data.amount_max_cents ?? null,
          body.data.bank_account_filter_id ?? null,
          body.data.then_vendor_id ?? null,
          body.data.then_account_id,
          body.data.then_class_id ?? null,
          body.data.then_memo_template ?? null,
          user.uuid,
        ]
      );
      const newId = (ins.rows[0] as { id?: string } | undefined)?.id;
      await appendCrudAudit(client, user.uuid, "banking.rule_created", { id: newId }, "info", "P7-W2-BANK");
      return newId ?? null;
    });
    if (!id) return;
    return reply.code(201).send({ id });
  });

  app.patch("/api/v1/banking/rules/:id", async (req, reply) => {
    const user = financeUser(req, reply);
    if (!user) return;

    const params = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
    const body = z
      .object({
        operating_company_id: z.string().uuid(),
        priority: z.coerce.number().int().optional(),
        is_active: z.boolean().optional(),
      })
      .safeParse(req.body ?? {});
    if (!params.success || !body.success) return validationError(reply, params.success ? body.error! : params.error);

    await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      await client.query(
        `
          UPDATE accounting.banking_rules
          SET
            priority = COALESCE($3, priority),
            is_active = COALESCE($4, is_active),
            updated_at = now()
          WHERE id = $1 AND operating_company_id = $2
        `,
        [params.data.id, body.data.operating_company_id, body.data.priority ?? null, body.data.is_active ?? null]
      );
      await appendCrudAudit(client, user.uuid, "banking.rule_updated", { id: params.data.id }, "info", "P7-W2-BANK");
    });
    return { ok: true };
  });

  app.delete("/api/v1/banking/rules/:id", async (req, reply) => {
    const user = financeUser(req, reply);
    if (!user) return;

    const params = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
    const q = companyQuerySchema.safeParse(req.query ?? {});
    if (!params.success || !q.success) return reply.code(400).send({ error: "validation_error" });

    await withCompanyScope(user.uuid, q.data.operating_company_id, async (client) => {
      // INV-2: void-never-delete — deactivate, never hard-delete banking rule config.
      await client.query(`UPDATE accounting.banking_rules SET is_active = false, updated_at = now() WHERE id = $1 AND operating_company_id = $2`, [
        params.data.id,
        q.data.operating_company_id,
      ]);
      await appendCrudAudit(client, user.uuid, "banking.rule_deleted", { id: params.data.id }, "warning", "P7-W2-BANK");
    });
    return { ok: true };
  });

  app.post("/api/v1/banking/transactions/:id/refresh-suggestion", async (req, reply) => {
    const user = financeUser(req, reply);
    if (!user) return;

    const params = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
    const body = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.body ?? {});
    if (!params.success || !body.success) return reply.code(400).send({ error: "validation_error" });

    await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      const txn = await client.query(`SELECT * FROM banking.bank_transactions WHERE id = $1`, [params.data.id]);
      const row = txn.rows[0];
      if (!row || String(row.operating_company_id) !== body.data.operating_company_id) {
        reply.code(404).send({ error: "not_found" });
        return;
      }
      const rulesRes = await client.query(
        `SELECT priority, description_contains, description_regex, amount_min_cents, amount_max_cents,
                bank_account_filter_id, then_vendor_id, then_account_id, then_class_id
         FROM accounting.banking_rules
         WHERE operating_company_id = $1 AND is_active = true`,
        [body.data.operating_company_id]
      );
      const sug = suggestionFromRules(rulesRes.rows as BankingRuleRow[], {
        description_normalized: row.description_normalized as string | null,
        amount_cents: Number(row.amount_cents),
        bank_account_id: String(row.bank_account_id),
      });
      await client.query(
        `
          UPDATE banking.bank_transactions
          SET
            suggested_vendor_id = $2::uuid,
            suggested_account_id = $3::uuid,
            suggested_confidence = $4,
            suggested_source = $5,
            suggested_at = now(),
            updated_at = now()
          WHERE id = $1
        `,
        [
          params.data.id,
          sug?.vendor_id ?? null,
          sug?.account_id ?? null,
          sug?.confidence ?? null,
          sug?.source ?? null,
        ]
      );
      await appendCrudAudit(client, user.uuid, "banking.txn_suggestion_refreshed", { transaction_id: params.data.id }, "info", "P7-W2-BANK");
    });
    if (reply.sent) return;
    return { ok: true };
  });

  app.post("/api/v1/banking/reconciliation-sessions", async (req, reply) => {
    const user = financeUser(req, reply);
    if (!user) return;

    const body = z
      .object({
        operating_company_id: z.string().uuid(),
        account_id: z.string().uuid(),
        period_start: z.string(),
        period_end: z.string(),
        statement_balance_cents: z.coerce.number().int(),
      })
      .safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const row = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      const ins = await client.query(
        `
          INSERT INTO banking.reconciliation_sessions (
            operating_company_id, bank_account_id, period_start, period_end,
            statement_balance_cents, book_balance_cents, variance_cents, status
          )
          VALUES (
            $1::uuid, $2::uuid, $3::date, $4::date,
            $5::bigint, 0::bigint,
            ($5::bigint - 0::bigint), 'open'
          )
          RETURNING id
        `,
        [
          body.data.operating_company_id,
          body.data.account_id,
          body.data.period_start,
          body.data.period_end,
          body.data.statement_balance_cents,
        ]
      );
      const sid = (ins.rows[0] as { id?: string } | undefined)?.id;
      await appendCrudAudit(client, user.uuid, "banking.reconciliation_session_created", { id: sid }, "info", "P7-W2-BANK");
      return sid ? { id: sid } : undefined;
    });

    return reply.code(201).send({ id: row?.id });
  });

  app.get("/api/v1/banking/reconciliation-sessions", async (req, reply) => {
    const user = financeUser(req, reply);
    if (!user) return;
    const q = companyQuerySchema.extend({ account_id: z.string().uuid().optional() }).safeParse(req.query ?? {});
    if (!q.success) return validationError(reply, q.error);

    const rows = await withCompanyScope(user.uuid, q.data.operating_company_id, async (client) => {
      const params: unknown[] = [q.data.operating_company_id];
      let where = `operating_company_id = $1`;
      if (q.data.account_id) {
        params.push(q.data.account_id);
        where += ` AND bank_account_id = $${params.length}`;
      }
      const res = await client.query(`SELECT * FROM banking.reconciliation_sessions WHERE ${where} ORDER BY period_end DESC LIMIT 100`, params);
      return res.rows;
    });
    return { items: rows };
  });

  app.get("/api/v1/banking/reconciliation-sessions/:id", async (req, reply) => {
    const user = financeUser(req, reply);
    if (!user) return;
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
    const q = companyQuerySchema.safeParse(req.query ?? {});
    if (!params.success || !q.success) return reply.code(400).send({ error: "validation_error" });

    const payload = await withCompanyScope(user.uuid, q.data.operating_company_id, async (client) => {
      const ses = await client.query(`SELECT * FROM banking.reconciliation_sessions WHERE id = $1 AND operating_company_id = $2`, [
        params.data.id,
        q.data.operating_company_id,
      ]);
      const session = ses.rows[0];
      if (!session) return null;
      const txns = await client.query(
        `
          SELECT *
          FROM banking.bank_transactions
          WHERE operating_company_id = $1
            AND reconciliation_session_id = $2::uuid
          ORDER BY transaction_date DESC
        `,
        [q.data.operating_company_id, params.data.id]
      );
      return { session, matched_transactions: txns.rows };
    });
    if (!payload) return reply.code(404).send({ error: "not_found" });
    return payload;
  });

  app.post("/api/v1/banking/reconciliation-sessions/:id/finalize", async (req, reply) => {
    const user = financeUser(req, reply);
    if (!user) return;

    const params = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
    const body = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.body ?? {});
    if (!params.success || !body.success) return reply.code(400).send({ error: "validation_error" });

    await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      const ses = await client.query(
        `SELECT variance_cents::text FROM banking.reconciliation_sessions WHERE id = $1 AND operating_company_id = $2`,
        [params.data.id, body.data.operating_company_id]
      );
      const variance = Number((ses.rows[0] as { variance_cents?: string } | undefined)?.variance_cents ?? 0);
      if (variance !== 0) {
        reply.code(409).send({ error: "variance_nonzero", variance_cents: variance });
        return;
      }
      await client.query(
        `
          UPDATE banking.reconciliation_sessions
          SET status = 'finalized',
              finalized_at = now(),
              reconciled_at = COALESCE(reconciled_at, now()),
              reconciled_by_user_id = $3::uuid
          WHERE id = $1 AND operating_company_id = $2
        `,
        [params.data.id, body.data.operating_company_id, user.uuid]
      );
      await appendCrudAudit(client, user.uuid, "banking.reconciliation_finalized", { id: params.data.id }, "info", "P7-W2-BANK");
    });
    if (reply.sent) return;
    return { ok: true };
  });
}
