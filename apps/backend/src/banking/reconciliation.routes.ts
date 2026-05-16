import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PoolClient } from "pg";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser, withLuciaBypass } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { computePayloadHashFromTxn, enqueueSyncJob } from "../integrations/qbo/qbo-sync.service.js";
import { insertCsvStatementBankTransaction } from "./transaction-ingestion.js";
import { applyBankingRulesForTransaction } from "./banking-rules.engine.js";

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

const matchBodySchema = z.object({
  transaction_id: z.string().uuid(),
  matched_event_type: z.enum(["load", "bill", "settlement"]),
  matched_event_id: z.string().uuid(),
});

const unmatchBodySchema = z.object({
  transaction_id: z.string().uuid(),
});

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
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
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
          AND operating_company_id = $2
        LIMIT 1
      `,
      [sessionId, operatingCompanyId]
    );
    return res.rows[0] ?? null;
  });
}

function computeSummaryFromTransactions(
  transactions: Array<{ amount_cents: number; is_credit: boolean; matched_load_id: string | null; matched_bill_id: string | null; matched_settlement_id: string | null }>
) {
  let matchedCreditsCents = 0;
  let matchedDebitsCents = 0;

  for (const transaction of transactions) {
    const isMatched = Boolean(transaction.matched_load_id || transaction.matched_bill_id || transaction.matched_settlement_id);
    if (!isMatched) continue;
    const amountAbs = Math.abs(Number(transaction.amount_cents ?? 0));
    if (transaction.is_credit) matchedCreditsCents += amountAbs;
    else matchedDebitsCents += amountAbs;
  }
  const bookBalanceCents = matchedCreditsCents - matchedDebitsCents;
  return {
    matchedCreditsCents,
    matchedDebitsCents,
    bookBalanceCents,
  };
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
  app.get("/api/v1/banking/reconciliation/sessions", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;

    const payload = await withCompanyScope(user.uuid, companyId, async (client) => {
      const openRes = await client.query(
        `
          SELECT id, bank_account_id, period_start, period_end, statement_balance_cents, variance_cents, status, created_at
          FROM banking.reconciliation_sessions
          WHERE operating_company_id = $1
            AND status = 'open'
          ORDER BY created_at DESC
        `,
        [companyId]
      );
      const completedRes = await client.query(
        `
          SELECT id, bank_account_id, period_start, period_end, statement_balance_cents, variance_cents, status, reconciled_at
          FROM banking.reconciliation_sessions
          WHERE operating_company_id = $1
            AND status = 'reconciled'
          ORDER BY reconciled_at DESC NULLS LAST, created_at DESC
          LIMIT 5
        `,
        [companyId]
      );
      return { open_sessions: openRes.rows, completed_sessions: completedRes.rows };
    });

    return payload;
  });

  app.post("/api/v1/banking/reconciliation/start", async (req, reply) => {
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

    const created = await withCompanyScope(user.uuid, accountContext.operating_company_id, async (client) => {
      const insertRes = await client.query<{ id: string }>(
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
          VALUES ($1,$2,$3,$4,$5,0,$5,'open',now(),now())
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
    return { session_id: created };
  });

  app.get("/api/v1/banking/reconciliation/:sessionId", async (req, reply) => {
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
        matched_load_id: string | null;
        matched_bill_id: string | null;
        matched_settlement_id: string | null;
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
            matched_load_id,
            matched_bill_id,
            matched_settlement_id,
            notes
          FROM banking.bank_transactions
          WHERE bank_account_id = $1
            AND operating_company_id = $2
            AND transaction_date BETWEEN $3 AND $4
          ORDER BY transaction_date DESC, created_at DESC
        `,
        [session.bank_account_id, companyId, session.period_start, session.period_end]
      );

      const transactions = txnRes.rows;
      const summary = computeSummaryFromTransactions(transactions);
      const varianceCents = Number(session.statement_balance_cents) - Number(summary.bookBalanceCents);

      await client.query(
        `
          UPDATE banking.reconciliation_sessions
          SET
            book_balance_cents = $2,
            variance_cents = $3,
            updated_at = now()
          WHERE id = $1
        `,
        [session.id, summary.bookBalanceCents, varianceCents]
      );

      const matchedTransactions = transactions.filter((row) => Boolean(row.matched_load_id || row.matched_bill_id || row.matched_settlement_id));
      const unmatchedTransactions = transactions.filter((row) => !(row.matched_load_id || row.matched_bill_id || row.matched_settlement_id));

      const loads = await client
        .query(
          `
            SELECT id, created_at::date AS event_date, 'load'::text AS event_type
            FROM mdata.loads
            WHERE operating_company_id = $1
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
                WHERE operating_company_id = $1
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
                WHERE operating_company_id = $1
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
                  WHERE operating_company_id = $1
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
        candidates: {
          loads,
          bills,
          settlements,
        },
        summary: {
          statement_balance_cents: Number(session.statement_balance_cents),
          matched_credits_cents: summary.matchedCreditsCents,
          matched_debits_cents: summary.matchedDebitsCents,
          book_balance_cents: summary.bookBalanceCents,
          variance_cents: varianceCents,
        },
      };
    });

    return payload;
  });

  app.post("/api/v1/banking/reconciliation/:sessionId/match", async (req, reply) => {
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
            AND operating_company_id = $3
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

    if (!updated) return reply.code(404).send({ error: "transaction_not_in_session_period" });
    return { ok: true };
  });

  app.post("/api/v1/banking/reconciliation/:sessionId/unmatch", async (req, reply) => {
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
            AND operating_company_id = $3
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

    const { varianceCents } = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const txnRes = await client.query<{ amount_cents: number; is_credit: boolean; matched_load_id: string | null; matched_bill_id: string | null; matched_settlement_id: string | null }>(
        `
          SELECT amount_cents, is_credit, matched_load_id, matched_bill_id, matched_settlement_id
          FROM banking.bank_transactions
          WHERE bank_account_id = $1
            AND operating_company_id = $2
            AND transaction_date BETWEEN $3 AND $4
        `,
        [session.bank_account_id, query.data.operating_company_id, session.period_start, session.period_end]
      );
      const summary = computeSummaryFromTransactions(txnRes.rows);
      const variance = Number(session.statement_balance_cents) - Number(summary.bookBalanceCents);
      return { varianceCents: variance, bookBalanceCents: summary.bookBalanceCents };
    });

    if (Math.abs(varianceCents) > 1000 && !body.data.force_complete) {
      return reply.code(409).send({ error: "variance_exceeds_tolerance", variance_cents: varianceCents });
    }
    if (body.data.force_complete) {
      if (user.role !== "Owner") return reply.code(403).send({ error: "force_complete_requires_owner" });
      if (!body.data.reason) return reply.code(400).send({ error: "force_complete_reason_required" });
    }
    if (!isOwnerOrAdmin(user.role) && body.data.force_complete) {
      return reply.code(403).send({ error: "force_complete_requires_owner_or_admin" });
    }

    const transactionsToSync = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      await client.query(
        `
          UPDATE banking.reconciliation_sessions
          SET
            status = 'reconciled',
            reconciled_by_user_id = $2,
            reconciled_at = now(),
            variance_cents = $3,
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
            AND bt.operating_company_id = $2
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
            queue_id: queued.id,
            session_id: session.id,
          },
          "info",
          "P5-T3-QBO-SYNC"
        );
      });
    }

    return { ok: true, variance_cents: varianceCents };
  });

  app.post("/api/v1/banking/upload-statement", async (req, reply) => {
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
          is_credit: cents < 0,
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

