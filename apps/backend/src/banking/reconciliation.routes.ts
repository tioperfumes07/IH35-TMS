import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PoolClient } from "pg";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser, withLuciaBypass } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { computePayloadHashFromTxn, enqueueSyncJob } from "../integrations/qbo/qbo-sync.service.js";
import { insertCsvStatementBankTransaction } from "./transaction-ingestion.js";
import { applyBankingRulesForTransaction } from "./banking-rules.engine.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { emitBankingSpineEvent } from "./banking-spine-emit.js";
import { assertBankAccountUsable, bankTransactionHiddenFilterSql, isBankAccountHideEnabled } from "./bank-account-visibility.js";
import { computeAdjustedBalanceSummary } from "./adjusted-balance-rec.js";
import { ageUnclearedTransactions, type ReconcilingItemClass } from "./reconciling-item-aging.js";

const startBodySchema = z.object({
  bank_account_id: z.string().uuid(),
  period_start: z.string().date(),
  period_end: z.string().date(),
  statement_balance_cents: z.coerce.number().int(),
});

const sessionParamsSchema = z.object({
  sessionId: z.string().uuid(),
});

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

// LINK-F5175: optional bank_account_id filter for the sessions list, so a bank-account-scoped
// reverse surface (BankAccountDetail) can drill in without fetching every account's sessions and
// filtering client-side (which would silently truncate once a company's session count crosses the
// completed_sessions LIMIT 5 below — see the fines reverse-section precedent for why server-side
// scoping is required here, not client-side).
const sessionsQuerySchema = companyQuerySchema.extend({
  bank_account_id: z.string().uuid().optional(),
});

const matchBodySchema = z.object({
  transaction_id: z.string().uuid(),
  matched_event_type: z.enum(["load", "bill", "settlement"]),
  matched_event_id: z.string().uuid(),
});

const unmatchBodySchema = z.object({
  transaction_id: z.string().uuid(),
});

// ACCT-F5574: table-scoped existence check for POST /:sessionId/match's matched_event_id, mirroring
// obligation-reconcile.routes.ts's OBLIGATION_EXISTENCE_SQL (ACCT-F5573) -- the same class of bug,
// a second route in this module that also writes a caller-supplied id straight onto
// matched_load_id/matched_bill_id/matched_settlement_id with no check it exists or belongs to this
// company.
const MATCHED_EVENT_EXISTENCE_SQL: Record<z.infer<typeof matchBodySchema.shape.matched_event_type>, string> = {
  load: `SELECT 1 FROM mdata.loads WHERE id = $1::uuid AND operating_company_id = $2::uuid AND soft_deleted_at IS NULL`,
  bill: `SELECT 1 FROM accounting.bills WHERE id = $1::uuid AND operating_company_id = $2::uuid AND revoked_at IS NULL`,
  settlement: `SELECT 1 FROM driver_finance.driver_settlements WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
};

const completeBodySchema = z.object({
  force_complete: z.boolean().optional().default(false),
  reason: z.string().trim().max(500).optional(),
});

const csvUploadBodySchema = z.object({
  bank_account_id: z.string().uuid(),
});

type ReconciliationRole = "Owner" | "Administrator" | "Accountant";

const RECON_ROLES = new Set<ReconciliationRole>(["Owner", "Administrator", "Accountant"]);
const OWNER_ADMIN_ROLES = new Set<ReconciliationRole>(["Owner", "Administrator"]);

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

function isOwnerOrAdmin(role: string): role is ReconciliationRole {
  return OWNER_ADMIN_ROLES.has(role as ReconciliationRole);
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

async function loadSession(
  userId: string,
  sessionId: string,
  operatingCompanyId: string
) {
  return withCompanyScope(userId, operatingCompanyId, async (client) => {
    const res = await client.query<{
      id: string;
      bank_account_id: string;
      operating_company_id: string;
      period_start: string;
      period_end: string;
      statement_balance_cents: number;
      book_balance_cents: number | null;
      variance_cents: number | null;
      status: string;
      reconciled_by_user_id: string | null;
      reconciled_at: string | null;
      notes: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `
        SELECT *
        FROM banking.reconciliation_sessions
        WHERE id = $1
          AND operating_company_id = $2::uuid
        LIMIT 1
      `,
      [sessionId, operatingCompanyId]
    );
    return res.rows[0] ?? null;
  });
}

function computeSummaryFromTransactions(
  transactions: Array<{
    amount_cents: number;
    is_credit: boolean;
    reconciliation_cleared?: boolean | null;
    matched_load_id?: string | null;
    matched_bill_id?: string | null;
    matched_settlement_id?: string | null;
    // EXPENSE column-wave: bank-transaction-splits.service.ts (and accounting/bank-recon's accept
    // flow) genuinely stamp matched_expense_id, but this route's own "matched" computation never
    // counted it — a transaction matched ONLY to an expense showed as uncleared/unmatched here even
    // though the accounting side (ExpenseDetailPage.tsx) already showed the reverse link correctly.
    matched_expense_id?: string | null;
  }>,
  opts: { beginningBalanceCents: number; statementEndingCents: number }
) {
  // BANK-DOM-03: prefer explicit reconciliation_cleared. Until operators clear rows, fall back to
  // prior matched_* linkage so existing sessions are not stuck at all-uncleared.
  const anyCleared = transactions.some((t) => Boolean(t.reconciliation_cleared));
  const normalized = transactions.map((t) => ({
    amount_cents: t.amount_cents,
    is_credit: t.is_credit,
    reconciliation_cleared: anyCleared
      ? Boolean(t.reconciliation_cleared)
      : Boolean(t.matched_load_id || t.matched_bill_id || t.matched_settlement_id || t.matched_expense_id),
  }));
  return computeAdjustedBalanceSummary({
    beginningBalanceCents: opts.beginningBalanceCents,
    statementEndingCents: opts.statementEndingCents,
    transactions: normalized,
  });
}

async function relationExists(relation: string) {
  return withLuciaBypass(async (client) => {
    const res = await client.query<{ exists: boolean }>(`SELECT to_regclass($1) IS NOT NULL AS exists`, [relation]);
    return Boolean(res.rows[0]?.exists);
  });
}

function parseCsvLine(line: string) {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      out.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  out.push(current.trim());
  return out;
}

function amountToCents(input: string) {
  const normalized = input.replace(/[$,\s]/g, "");
  const value = Number.parseFloat(normalized);
  if (Number.isNaN(value)) return null;
  return Math.round(value * 100);
}

export async function registerBankingReconciliationRoutes(app: FastifyInstance) {
  app.get("/api/v1/banking/reconciliation/sessions", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const query = sessionsQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;
    const bankAccountId = query.data.bank_account_id ?? null;

    const payload = await withCompanyScope(user.uuid, companyId, async (client) => {
      // BANK-ACCOUNT-HIDE: reconciliation sessions for an account hidden FOR THIS ENTITY must not
      // surface (flag OFF by default — see docs/accounting/BANK-ACCOUNT-ENTITY-HIDE-DESIGN.md).
      const hideOn = await isBankAccountHideEnabled(client, companyId);
      const hiddenSessionFilter = hideOn
        ? `AND NOT EXISTS (SELECT 1 FROM banking.bank_accounts __bah WHERE __bah.id = bank_account_id AND __bah.hidden_at IS NOT NULL)`
        : "";
      // LINK-F5175: server-side bank_account_id scoping, not a client-side filter of this already-
      // capped result set (completed_sessions is LIMIT 5 company-wide — a client filter would drop
      // an account's own completed sessions once other accounts fill that cap).
      const acctFilter = bankAccountId ? `AND bank_account_id = $2::uuid` : "";
      const acctParams = bankAccountId ? [companyId, bankAccountId] : [companyId];
      const openRes = await client.query(
        `
          SELECT id, bank_account_id, period_start, period_end, statement_balance_cents, variance_cents, status, created_at
          FROM banking.reconciliation_sessions
          WHERE operating_company_id = $1::uuid
            AND status = 'open'
            ${hiddenSessionFilter}
            ${acctFilter}
          ORDER BY created_at DESC
        `,
        acctParams
      );
      const completedRes = await client.query(
        `
          SELECT id, bank_account_id, period_start, period_end, statement_balance_cents, variance_cents, status, reconciled_at
          FROM banking.reconciliation_sessions
          WHERE operating_company_id = $1::uuid
            AND status = 'reconciled'
            ${hiddenSessionFilter}
            ${acctFilter}
          ORDER BY reconciled_at DESC NULLS LAST, created_at DESC
          LIMIT 5
        `,
        acctParams
      );
      return { open_sessions: openRes.rows, completed_sessions: completedRes.rows };
    });

    return payload;
  });

  app.post("/api/v1/banking/reconciliation/start", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canReconcile(user.role)) return reply.code(403).send({ error: "forbidden" });

    const body = startBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const accountContext = await withLuciaBypass(async (client) => {
      const res = await client.query<{ id: string; operating_company_id: string }>(
        `
          SELECT id, operating_company_id
          FROM banking.bank_accounts
          WHERE id = $1
          LIMIT 1
        `,
        [body.data.bank_account_id]
      );
      return res.rows[0] ?? null;
    });
    if (!accountContext) return reply.code(404).send({ error: "bank_account_not_found" });

    const usable = await withCompanyScope(user.uuid, accountContext.operating_company_id, (client) =>
      assertBankAccountUsable(client, accountContext.id, accountContext.operating_company_id)
    );
    if (!usable) return reply.code(404).send({ error: "bank_account_not_found" });

    const created = await withCompanyScope(user.uuid, accountContext.operating_company_id, async (client) => {
      const priorRes = await client.query<{ statement_balance_cents: string | number | null }>(
        `
          SELECT statement_balance_cents
          FROM banking.reconciliation_sessions
          WHERE bank_account_id = $1
            AND operating_company_id = $2::uuid
            AND status = 'reconciled'
          ORDER BY reconciled_at DESC NULLS LAST, created_at DESC
          LIMIT 1
        `,
        [body.data.bank_account_id, accountContext.operating_company_id]
      );
      const beginningBalanceCents = Number(priorRes.rows[0]?.statement_balance_cents ?? 0);

      // BANK-DOM-03 columns are HELD — CI/prod may not have them until Neon-apply.
      // Prefer adjusted-balance INSERT; fall back to pre-DOM-03 shape on undefined_column.
      let insertRes: { rows: Array<{ id: string }> };
      try {
        insertRes = await client.query<{ id: string }>(
          `
            INSERT INTO banking.reconciliation_sessions (
              operating_company_id,
              bank_account_id,
              period_start,
              period_end,
              statement_balance_cents,
              beginning_balance_cents,
              book_balance_cents,
              variance_cents,
              status,
              created_at,
              updated_at
            )
            VALUES ($1,$2,$3,$4,$5,$6,$6,$5::bigint-$6::bigint,'open',now(),now())
            RETURNING id
          `,
          [
            accountContext.operating_company_id,
            body.data.bank_account_id,
            body.data.period_start,
            body.data.period_end,
            body.data.statement_balance_cents,
            beginningBalanceCents,
          ]
        );
      } catch (err) {
        if ((err as { code?: string }).code !== "42703") throw err;
        insertRes = await client.query<{ id: string }>(
          `
            INSERT INTO banking.reconciliation_sessions (
              operating_company_id,
              bank_account_id,
              period_start,
              period_end,
              statement_balance_cents,
              book_balance_cents,
              variance_cents,
              status,
              created_at,
              updated_at
            )
            VALUES ($1,$2,$3,$4,$5,$5,0,'open',now(),now())
            RETURNING id
          `,
          [
            accountContext.operating_company_id,
            body.data.bank_account_id,
            body.data.period_start,
            body.data.period_end,
            body.data.statement_balance_cents,
          ]
        );
      }
      const sessionId = insertRes.rows[0]?.id;
      if (!sessionId) return null;
      await appendCrudAudit(
        client,
        user.uuid,
        "banking.reconciliation.started",
        {
          resource_type: "banking.reconciliation_sessions",
          resource_id: sessionId,
          operating_company_id: accountContext.operating_company_id,
          bank_account_id: body.data.bank_account_id,
          period_start: body.data.period_start,
          period_end: body.data.period_end,
          statement_balance_cents: body.data.statement_balance_cents,
        },
        "info",
        "P5-T2-RECON"
      );
      return sessionId;
    });

    if (!created) return reply.code(500).send({ error: "failed_to_create_session" });
    void withCompanyScope(user.uuid, accountContext.operating_company_id, (client) =>
      emitBankingSpineEvent(client, {
        operating_company_id: accountContext.operating_company_id,
        actor_user_id: String(user.uuid),
        event_type: "reconciliation.started",
        entity_id: created,
        entity_type: "reconciliation_session",
        source_table: "banking.reconciliation_sessions",
        payload: { bank_account_id: body.data.bank_account_id },
      })
    ).catch((err) =>
      req.log.warn(
        { err, reconciliation_session_id: created, company_id: accountContext.operating_company_id },
        "spine_emit_banking_reconciliation_started_failed"
      )
    );
    return { session_id: created };
  });

  app.get("/api/v1/banking/reconciliation/:sessionId", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canReconcile(user.role)) return reply.code(403).send({ error: "forbidden" });

    const params = sessionParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;

    const session = await loadSession(user.uuid, params.data.sessionId, companyId);
    if (!session) return reply.code(404).send({ error: "session_not_found" });

    const payload = await withCompanyScope(user.uuid, companyId, async (client) => {
      const txnRes = await client.query<{
        id: string;
        bank_account_id: string;
        transaction_date: string;
        posted_date: string | null;
        amount_cents: number;
        description: string | null;
        merchant_name: string | null;
        plaid_category: string[];
        pending: boolean;
        is_credit: boolean;
        reconciliation_cleared: boolean;
        matched_load_id: string | null;
        matched_bill_id: string | null;
        matched_settlement_id: string | null;
        matched_expense_id: string | null;
        notes: string | null;
      }>(
        `
          SELECT
            id,
            bank_account_id,
            transaction_date,
            posted_date,
            amount_cents,
            description,
            merchant_name,
            plaid_category,
            pending,
            is_credit,
            reconciliation_cleared,
            matched_load_id,
            matched_bill_id,
            matched_settlement_id,
            matched_expense_id,
            notes
          FROM banking.bank_transactions
          WHERE bank_account_id = $1
            AND operating_company_id = $2::uuid
            AND transaction_date BETWEEN $3 AND $4
          ORDER BY transaction_date DESC, created_at DESC
        `,
        [session.bank_account_id, companyId, session.period_start, session.period_end]
      );

      const transactions = txnRes.rows;
      const beginningBalanceCents = Number(
        (session as { beginning_balance_cents?: number | string | null }).beginning_balance_cents ?? 0
      );
      const summary = computeSummaryFromTransactions(transactions, {
        beginningBalanceCents,
        statementEndingCents: Number(session.statement_balance_cents ?? 0),
      });
      const varianceCents = summary.varianceCents;

      try {
        await client.query(
          `
            UPDATE banking.reconciliation_sessions
            SET
              book_balance_cents = $2,
              variance_cents = $3,
              deposits_in_transit_cents = $4,
              outstanding_checks_cents = $5,
              adjusted_bank_balance_cents = $6,
              adjusted_book_balance_cents = $7,
              updated_at = now()
            WHERE id = $1
          `,
          [
            session.id,
            summary.bookBalanceCents,
            varianceCents,
            summary.depositsInTransitCents,
            summary.outstandingChecksCents,
            summary.adjustedBankBalanceCents,
            summary.adjustedBookBalanceCents,
          ]
        );
      } catch (err) {
        if ((err as { code?: string }).code !== "42703") throw err;
        await client.query(
          `
            UPDATE banking.reconciliation_sessions
            SET book_balance_cents = $2, variance_cents = $3, updated_at = now()
            WHERE id = $1
          `,
          [session.id, summary.bookBalanceCents, varianceCents]
        );
      }

      const matchedTransactions = transactions.filter((row) => Boolean(row.matched_load_id || row.matched_bill_id || row.matched_settlement_id || row.matched_expense_id));
      const unmatchedTransactions = transactions.filter((row) => !(row.matched_load_id || row.matched_bill_id || row.matched_settlement_id || row.matched_expense_id));
      // BANK-DOM-04: age + classify unmatched (uncleared) items; escalate 90+ / investigate.
      const reconcilingItems = ageUnclearedTransactions(unmatchedTransactions);
      const escalatedReconcilingItems = reconcilingItems.filter((item) => item.escalated);

      const loads = await client
        .query(
          `
            SELECT id, created_at::date AS event_date, 'load'::text AS event_type
            FROM mdata.loads
            WHERE operating_company_id = $1::uuid
              AND created_at::date BETWEEN $2 AND $3
            ORDER BY created_at DESC
            LIMIT 500
          `,
          [companyId, session.period_start, session.period_end]
        )
        .then((res) => res.rows)
        .catch(() => [] as Record<string, unknown>[]);

      const hasBills = await relationExists("accounting.bills");
      const bills = hasBills
        ? await client
            .query(
              `
                SELECT id, created_at::date AS event_date, 'bill'::text AS event_type
                FROM accounting.bills
                WHERE operating_company_id = $1::uuid
                  AND created_at::date BETWEEN $2 AND $3
                ORDER BY created_at DESC
                LIMIT 500
              `,
              [companyId, session.period_start, session.period_end]
            )
            .then((res) => res.rows)
            .catch(() => [] as Record<string, unknown>[])
        : [];

      const hasDriverPaySettlements = await relationExists("driver_pay.settlements");
      const hasDriverFinanceSettlements = await relationExists("driver_finance.driver_settlements");
      const settlements = hasDriverPaySettlements
        ? await client
            .query(
              `
                SELECT id, created_at::date AS event_date, 'settlement'::text AS event_type
                FROM driver_pay.settlements
                WHERE operating_company_id = $1::uuid
                  AND created_at::date BETWEEN $2 AND $3
                ORDER BY created_at DESC
                LIMIT 500
              `,
              [companyId, session.period_start, session.period_end]
            )
            .then((res) => res.rows)
            .catch(() => [] as Record<string, unknown>[])
        : hasDriverFinanceSettlements
          ? await client
              .query(
                `
                  SELECT id, created_at::date AS event_date, 'settlement'::text AS event_type
                  FROM driver_finance.driver_settlements
                  WHERE operating_company_id = $1::uuid
                    AND created_at::date BETWEEN $2 AND $3
                  ORDER BY created_at DESC
                  LIMIT 500
                `,
                [companyId, session.period_start, session.period_end]
              )
              .then((res) => res.rows)
              .catch(() => [] as Record<string, unknown>[])
          : [];

      return {
        session: {
          ...session,
          book_balance_cents: summary.bookBalanceCents,
          variance_cents: varianceCents,
        },
        matched_transactions: matchedTransactions,
        unmatched_transactions: unmatchedTransactions,
        reconciling_items: reconcilingItems,
        escalated_reconciling_items: escalatedReconcilingItems,
        candidates: {
          loads,
          bills,
          settlements,
        },
        summary: {
          statement_balance_cents: Number(session.statement_balance_cents),
          beginning_balance_cents: summary.beginningBalanceCents,
          cleared_credits_cents: summary.clearedCreditsCents,
          cleared_debits_cents: summary.clearedDebitsCents,
          deposits_in_transit_cents: summary.depositsInTransitCents,
          outstanding_checks_cents: summary.outstandingChecksCents,
          adjusted_bank_balance_cents: summary.adjustedBankBalanceCents,
          adjusted_book_balance_cents: summary.adjustedBookBalanceCents,
          matched_credits_cents: summary.matchedCreditsCents,
          matched_debits_cents: summary.matchedDebitsCents,
          book_balance_cents: summary.bookBalanceCents,
          variance_cents: varianceCents,
          reconciling_item_count: reconcilingItems.length,
          escalated_reconciling_item_count: escalatedReconcilingItems.length,
        },
        cleared_transactions: transactions.filter((row) => Boolean(row.reconciliation_cleared)),
        uncleared_transactions: transactions.filter((row) => !row.reconciliation_cleared),
      };
    });

    return payload;
  });

  app.patch("/api/v1/banking/reconciliation/:sessionId/reconciling-items/:transactionId", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canReconcile(user.role)) return reply.code(403).send({ error: "forbidden" });

    const params = z
      .object({ sessionId: z.string().uuid(), transactionId: z.string().uuid() })
      .safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const body = z
      .object({
        classification: z.enum(["timing", "adjustment", "investigate"]),
        escalate: z.boolean().optional(),
      })
      .safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const session = await loadSession(user.uuid, params.data.sessionId, query.data.operating_company_id);
    if (!session) return reply.code(404).send({ error: "session_not_found" });
    if (session.status === "reconciled") {
      return reply.code(409).send({ error: "reconciled_session_locked" });
    }

    try {
      const updated = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
        const classification = body.data.classification as ReconcilingItemClass;
        const escalate = body.data.escalate ?? classification === "investigate";
        const res = await client.query(
          `
            UPDATE banking.bank_transactions
            SET
              reconciling_item_class = $4,
              reconciling_item_escalated_at = CASE WHEN $5 THEN COALESCE(reconciling_item_escalated_at, now()) ELSE NULL END,
              updated_at = now()
            WHERE id = $1
              AND bank_account_id = $2
              AND operating_company_id = $3::uuid
            RETURNING id, reconciling_item_class, reconciling_item_escalated_at
          `,
          [
            params.data.transactionId,
            session.bank_account_id,
            query.data.operating_company_id,
            classification,
            escalate,
          ]
        );
        return res.rows[0] ?? null;
      });
      if (!updated) return reply.code(404).send({ error: "transaction_not_found" });
      return { ok: true, item: updated };
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "42703") {
        return reply.code(503).send({
          error: "reconciling_item_columns_pending_neon_apply",
          message: "BANK-DOM-04 migration not yet applied on this database",
        });
      }
      throw err;
    }
  });

  app.post("/api/v1/banking/reconciliation/:sessionId/clear", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canReconcile(user.role)) return reply.code(403).send({ error: "forbidden" });

    const params = sessionParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const body = z
      .object({
        transaction_id: z.string().uuid(),
        cleared: z.boolean(),
      })
      .safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const session = await loadSession(user.uuid, params.data.sessionId, query.data.operating_company_id);
    if (!session) return reply.code(404).send({ error: "session_not_found" });
    if (session.status === "reconciled") {
      return reply.code(409).send({ error: "reconciled_session_locked" });
    }

    const updated = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query<{ id: string }>(
        `
          UPDATE banking.bank_transactions
          SET
            reconciliation_cleared = $3,
            reconciliation_session_id = CASE WHEN $3 THEN $4::uuid ELSE reconciliation_session_id END,
            updated_at = now()
          WHERE id = $1
            AND operating_company_id = $2::uuid
            AND bank_account_id = $5
            AND transaction_date BETWEEN $6 AND $7
          RETURNING id
        `,
        [
          body.data.transaction_id,
          query.data.operating_company_id,
          body.data.cleared,
          session.id,
          session.bank_account_id,
          session.period_start,
          session.period_end,
        ]
      );
      return Boolean(res.rows[0]);
    });
    if (!updated) return reply.code(404).send({ error: "transaction_not_found" });
    return { ok: true, transaction_id: body.data.transaction_id, cleared: body.data.cleared };
  });

  app.post("/api/v1/banking/reconciliation/:sessionId/match", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canReconcile(user.role)) return reply.code(403).send({ error: "forbidden" });

    const params = sessionParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const body = matchBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const session = await loadSession(user.uuid, params.data.sessionId, query.data.operating_company_id);
    if (!session) return reply.code(404).send({ error: "session_not_found" });

    const updated = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const txCheck = await client.query<{ id: string }>(
        `
          SELECT id
          FROM banking.bank_transactions
          WHERE id = $1
            AND bank_account_id = $2
            AND operating_company_id = $3::uuid
            AND transaction_date BETWEEN $4 AND $5
          LIMIT 1
        `,
        [
          body.data.transaction_id,
          session.bank_account_id,
          query.data.operating_company_id,
          session.period_start,
          session.period_end,
        ]
      );
      if (!txCheck.rows[0]) return false;

      // ACCT-F5574: verify matched_event_id exists and belongs to this company BEFORE writing it
      // onto the transaction -- previously trusted outright, silently marking a real transaction
      // "matched" against a bogus/foreign id.
      const eventExists = await client.query(
        MATCHED_EVENT_EXISTENCE_SQL[body.data.matched_event_type],
        [body.data.matched_event_id, query.data.operating_company_id]
      );
      if (!eventExists.rows[0]) return "event_not_found" as const;

      let loadId: string | null = null;
      let billId: string | null = null;
      let settlementId: string | null = null;
      if (body.data.matched_event_type === "load") loadId = body.data.matched_event_id;
      if (body.data.matched_event_type === "bill") billId = body.data.matched_event_id;
      if (body.data.matched_event_type === "settlement") settlementId = body.data.matched_event_id;

      await client.query(
        `
          UPDATE banking.bank_transactions
          SET
            matched_load_id = $2,
            matched_bill_id = $3,
            matched_settlement_id = $4,
            updated_at = now()
          WHERE id = $1
        `,
        [body.data.transaction_id, loadId, billId, settlementId]
      );

      await appendCrudAudit(
        client,
        user.uuid,
        "banking.transaction.matched",
        {
          resource_type: "banking.bank_transactions",
          resource_id: body.data.transaction_id,
          session_id: session.id,
          matched_event_type: body.data.matched_event_type,
          matched_event_id: body.data.matched_event_id,
        },
        "info",
        "P5-T2-RECON"
      );
      return true;
    });

    if (updated === "event_not_found") return reply.code(404).send({ error: "matched_event_not_found" });
    if (!updated) return reply.code(404).send({ error: "transaction_not_in_session_period" });
    return { ok: true };
  });

  app.post("/api/v1/banking/reconciliation/:sessionId/unmatch", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canReconcile(user.role)) return reply.code(403).send({ error: "forbidden" });

    const params = sessionParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const body = unmatchBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const session = await loadSession(user.uuid, params.data.sessionId, query.data.operating_company_id);
    if (!session) return reply.code(404).send({ error: "session_not_found" });

    const updated = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE banking.bank_transactions
          SET
            matched_load_id = NULL,
            matched_bill_id = NULL,
            matched_settlement_id = NULL,
            updated_at = now()
          WHERE id = $1
            AND bank_account_id = $2
            AND operating_company_id = $3::uuid
            AND transaction_date BETWEEN $4 AND $5
          RETURNING id
        `,
        [
          body.data.transaction_id,
          session.bank_account_id,
          query.data.operating_company_id,
          session.period_start,
          session.period_end,
        ]
      );
      if (!res.rows[0]) return false;

      await appendCrudAudit(
        client,
        user.uuid,
        "banking.transaction.unmatched",
        {
          resource_type: "banking.bank_transactions",
          resource_id: body.data.transaction_id,
          session_id: session.id,
        },
        "info",
        "P5-T2-RECON"
      );
      return true;
    });

    if (!updated) return reply.code(404).send({ error: "transaction_not_in_session_period" });
    return { ok: true };
  });

  app.post("/api/v1/banking/reconciliation/:sessionId/complete", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canReconcile(user.role)) return reply.code(403).send({ error: "forbidden" });

    const params = sessionParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const body = completeBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const session = await loadSession(user.uuid, params.data.sessionId, query.data.operating_company_id);
    if (!session) return reply.code(404).send({ error: "session_not_found" });

    const { varianceCents, summary } = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const txnRes = await client.query<{
        amount_cents: number;
        is_credit: boolean;
        reconciliation_cleared: boolean;
        matched_load_id: string | null;
        matched_bill_id: string | null;
        matched_settlement_id: string | null;
        matched_expense_id: string | null;
      }>(
        `
          SELECT amount_cents, is_credit, reconciliation_cleared,
                 matched_load_id, matched_bill_id, matched_settlement_id, matched_expense_id
          FROM banking.bank_transactions
          WHERE bank_account_id = $1
            AND operating_company_id = $2::uuid
            AND transaction_date BETWEEN $3 AND $4
        `,
        [session.bank_account_id, query.data.operating_company_id, session.period_start, session.period_end]
      );
      const beginningBalanceCents = Number(
        (session as { beginning_balance_cents?: number | string | null }).beginning_balance_cents ?? 0
      );
      const summaryInner = computeSummaryFromTransactions(txnRes.rows, {
        beginningBalanceCents,
        statementEndingCents: Number(session.statement_balance_cents ?? 0),
      });
      return { varianceCents: summaryInner.varianceCents, summary: summaryInner };
    });

    // A reconciliation only closes ordinarily at exactly $0.00 difference. An Owner may make an
    // explicitly reasoned exception for any non-zero variance; a hidden under-$10 tolerance would
    // certify an unreconciled cash balance without an accountable override.
    if (varianceCents !== 0 && !body.data.force_complete) {
      return reply.code(409).send({ error: "reconciliation_difference_not_zero", variance_cents: varianceCents });
    }
    if (body.data.force_complete) {
      if (user.role !== "Owner") return reply.code(403).send({ error: "force_complete_requires_owner" });
      if (!body.data.reason) return reply.code(400).send({ error: "force_complete_reason_required" });
    }
    if (!isOwnerOrAdmin(user.role) && body.data.force_complete) {
      return reply.code(403).send({ error: "force_complete_requires_owner_or_admin" });
    }

    const transactionsToSync = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const completeParams = [
        session.id,
        user.uuid,
        varianceCents,
        body.data.force_complete ? `force_complete_reason: ${body.data.reason}` : null,
        summary.bookBalanceCents,
        summary.depositsInTransitCents,
        summary.outstandingChecksCents,
        summary.adjustedBankBalanceCents,
        summary.adjustedBookBalanceCents,
      ] as const;
      try {
        await client.query(
          `
            UPDATE banking.reconciliation_sessions
            SET
              status = 'reconciled',
              reconciled_by_user_id = $2,
              reconciled_at = now(),
              variance_cents = $3,
              book_balance_cents = $5,
              deposits_in_transit_cents = $6,
              outstanding_checks_cents = $7,
              adjusted_bank_balance_cents = $8,
              adjusted_book_balance_cents = $9,
              updated_at = now(),
              notes = CASE
                WHEN $4::text IS NULL THEN notes
                WHEN notes IS NULL OR notes = '' THEN $4::text
                ELSE concat(notes, E'\\n', $4::text)
              END
            WHERE id = $1
          `,
          [...completeParams]
        );
      } catch (err) {
        if ((err as { code?: string }).code !== "42703") throw err;
        await client.query(
          `
            UPDATE banking.reconciliation_sessions
            SET
              status = 'reconciled',
              reconciled_by_user_id = $2,
              reconciled_at = now(),
              variance_cents = $3,
              book_balance_cents = $5,
              updated_at = now(),
              notes = CASE
                WHEN $4::text IS NULL THEN notes
                WHEN notes IS NULL OR notes = '' THEN $4::text
                ELSE concat(notes, E'\\n', $4::text)
              END
            WHERE id = $1
          `,
          [
            session.id,
            user.uuid,
            varianceCents,
            body.data.force_complete ? `force_complete_reason: ${body.data.reason}` : null,
            summary.bookBalanceCents,
          ]
        );
      }
      // BANK-DOM-02: stamp membership so later mutations have an explicit session link
      // (date-window membership remains a second defense in the immutability guard).
      await client.query(
        `
          UPDATE banking.bank_transactions
          SET
            reconciliation_session_id = $1,
            updated_at = now()
          WHERE bank_account_id = $2
            AND operating_company_id = $3::uuid
            AND transaction_date BETWEEN $4 AND $5
            AND reconciliation_session_id IS NULL
        `,
        [
          session.id,
          session.bank_account_id,
          query.data.operating_company_id,
          session.period_start,
          session.period_end,
        ]
      );
      await appendCrudAudit(
        client,
        user.uuid,
        "banking.reconciliation.completed",
        {
          resource_type: "banking.reconciliation_sessions",
          resource_id: session.id,
          variance_cents: varianceCents,
          force_complete: body.data.force_complete,
          force_complete_reason: body.data.reason ?? null,
        },
        "info",
        "P5-T2-RECON"
      );

      const syncCandidatesRes = await client.query<{
        id: string;
        amount_cents: number;
        transaction_date: string;
        matched_load_id: string | null;
        matched_bill_id: string | null;
        matched_settlement_id: string | null;
        account_class: string | null;
      }>(
        `
          SELECT
            bt.id,
            bt.amount_cents::int,
            bt.transaction_date::text,
            bt.matched_load_id,
            bt.matched_bill_id,
            bt.matched_settlement_id,
            ba.account_class::text AS account_class
          FROM banking.bank_transactions bt
          JOIN banking.bank_accounts ba ON ba.id = bt.bank_account_id
          WHERE bt.bank_account_id = $1
            AND bt.operating_company_id = $2::uuid
            AND bt.transaction_date BETWEEN $3 AND $4
            AND (bt.matched_load_id IS NOT NULL OR bt.matched_bill_id IS NOT NULL OR bt.matched_settlement_id IS NOT NULL)
            AND bt.qbo_synced_at IS NULL
        `,
        [session.bank_account_id, query.data.operating_company_id, session.period_start, session.period_end]
      );
      return syncCandidatesRes.rows;
    });

    for (const txn of transactionsToSync) {
      const payloadHash = computePayloadHashFromTxn(txn);
      const queued = await enqueueSyncJob(query.data.operating_company_id, "bank_transaction", txn.id, payloadHash, user.uuid);
      await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
        await appendCrudAudit(
          client,
          user.uuid,
          "banking.qbo_sync.enqueued",
          {
            resource_type: "banking.bank_transactions",
            resource_id: txn.id,
            queue_id: queued?.id ?? null,
            session_id: session.id,
          },
          "info",
          "P5-T3-QBO-SYNC"
        );
      });
    }

    void withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
      emitBankingSpineEvent(client, {
        operating_company_id: query.data.operating_company_id,
        actor_user_id: String(user.uuid),
        event_type: "reconciliation.completed",
        entity_id: session.id,
        entity_type: "reconciliation_session",
        source_table: "banking.reconciliation_sessions",
        payload: { variance_cents: varianceCents },
      })
    ).catch((err) =>
      req.log.warn(
        { err, reconciliation_session_id: session.id, company_id: query.data.operating_company_id },
        "spine_emit_banking_reconciliation_completed_failed"
      )
    );
    return { ok: true, variance_cents: varianceCents };
  });

  app.post("/api/v1/banking/upload-statement", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canReconcile(user.role)) return reply.code(403).send({ error: "forbidden" });

    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "csv_file_required" });
    const fieldsRaw = Object.fromEntries(
      Object.entries(file.fields).map(([key, value]) => {
        const fieldValue = Array.isArray(value)
          ? String((value[0] as { value?: unknown } | undefined)?.value ?? "")
          : String((value as { value?: unknown } | undefined)?.value ?? "");
        return [key, fieldValue];
      })
    );
    const body = csvUploadBodySchema.safeParse(fieldsRaw);
    if (!body.success) return sendValidationError(reply, body.error);

    const accountContext = await withLuciaBypass(async (client) => {
      const res = await client.query<{ id: string; operating_company_id: string }>(
        `SELECT id, operating_company_id FROM banking.bank_accounts WHERE id = $1 LIMIT 1`,
        [body.data.bank_account_id]
      );
      return res.rows[0] ?? null;
    });
    if (!accountContext) return reply.code(404).send({ error: "bank_account_not_found" });
    const csvUploadUsable = await withCompanyScope(user.uuid, accountContext.operating_company_id, (client) =>
      assertBankAccountUsable(client, accountContext.id, accountContext.operating_company_id)
    );
    if (!csvUploadUsable) return reply.code(404).send({ error: "bank_account_not_found" });

    const content = (await file.toBuffer()).toString("utf-8");
    const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length < 2) return reply.code(400).send({ error: "csv_missing_rows" });

    const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase());
    const dateIdx = headers.indexOf("date");
    const descIdx = headers.indexOf("description");
    const amountIdx = headers.indexOf("amount");
    if (dateIdx < 0 || descIdx < 0 || amountIdx < 0) {
      return reply.code(400).send({ error: "csv_missing_required_columns", required: ["date", "description", "amount"] });
    }

    let added = 0;
    const errors: Array<{ line: number; reason: string }> = [];

    await withCompanyScope(user.uuid, accountContext.operating_company_id, async (client) => {
      for (let i = 1; i < lines.length; i += 1) {
        const cols = parseCsvLine(lines[i]);
        const rawDate = cols[dateIdx] ?? "";
        const rawDesc = cols[descIdx] ?? "";
        const rawAmount = cols[amountIdx] ?? "";
        const cents = amountToCents(rawAmount);
        if (!rawDate || !rawDesc || cents == null) {
          errors.push({ line: i + 1, reason: "invalid_date_description_or_amount" });
          continue;
        }
        const inserted = await insertCsvStatementBankTransaction(client, {
          bank_account_id: body.data.bank_account_id,
          operating_company_id: accountContext.operating_company_id,
          transaction_date: rawDate,
          posted_date: rawDate,
          amount_cents: Math.abs(cents),
          description: rawDesc,
          // Direction convention (see bank-feed-gl-posting.service.ts): is_credit=true = money IN,
          // is_credit=false = money OUT. Single-"amount"-column bank CSVs (Wells Fargo — every DIP
          // account here) export withdrawals/debits as NEGATIVE and deposits/credits as POSITIVE.
          // So money-in is cents > 0. The old `cents < 0` inverted it, recording every withdrawal
          // as an inbound credit (a $500 fuel debit showed as $500 received) and corrupting recon.
          is_credit: cents > 0,
          notes: "source:manual_upload",
        });
        const insRow = inserted.rows?.[0] as { id?: string } | undefined;
        if (insRow?.id) {
          await applyBankingRulesForTransaction(client as PoolClient, insRow.id, accountContext.operating_company_id);
          added += 1;
        }
      }

      await appendCrudAudit(
        client,
        user.uuid,
        "banking.transaction.imported",
        {
          source: "manual_upload",
          bank_account_id: body.data.bank_account_id,
          added_count: added,
          error_count: errors.length,
        },
        "info",
        "P5-T2-RECON"
      );
    });

    return { added, errors };
  });
}

