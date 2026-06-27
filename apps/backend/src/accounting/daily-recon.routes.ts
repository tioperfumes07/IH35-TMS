/**
 * Daily TMS↔QBO Reconciliation route — read-only parity view.
 *
 * GET /api/v1/accounting/daily-recon
 *   ?operating_company_id=<uuid>
 *   &from_date=YYYY-MM-DD       (default: 30 days ago)
 *   &to_date=YYYY-MM-DD         (default: today)
 *   &entity_type=<type>         (optional filter)
 *
 * TMS side  : accounting.journal_entries + accounting.journal_entry_postings (posted only)
 * QBO side  : integrations.qbo_sync_queue (synced rows with qbo_id), joined to source entity
 *
 * Match logic per (entity_type, entity_id):
 *   MATCHED            — TMS posted + queue synced + amounts agree
 *   MISSING_IN_QBO     — TMS posted + queue pending/failed/dead_letter (never reached QBO)
 *   AMOUNT_MISMATCH    — TMS amount ≠ QBO amount (stored in queue payload_jsonb)
 *   MISSING_IN_TMS     — queue synced BUT no corresponding posted JE in accounting.*
 *
 * Entity-scoped: operating_company_id enforced via RLS set_config + WHERE clause.
 * GL posting OFF → honest empty state (posting_enabled: false) — no false green.
 * Read-only — never writes, never repairs.
 */

import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";

const querySchema = companyQuerySchema.extend({
  from_date: z.string().date().optional(),
  to_date: z.string().date().optional(),
  entity_type: z.string().optional(),
  match_status: z.enum(["matched", "missing_in_qbo", "amount_mismatch", "missing_in_tms", "all"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export type DailyReconMatchStatus =
  | "matched"
  | "missing_in_qbo"
  | "amount_mismatch"
  | "missing_in_tms";

export type DailyReconRow = {
  date: string;
  entity_type: string;
  entity_id: string;
  tms_je_id: string | null;
  tms_amount_cents: number | null;
  tms_memo: string | null;
  tms_status: string | null;
  qbo_id: string | null;
  qbo_sync_status: string | null;
  qbo_amount_cents: number | null;
  qbo_error: string | null;
  match_status: DailyReconMatchStatus;
  tms_detail_path: string | null;
};

export type DailyReconDay = {
  date: string;
  all_reconciled: boolean;
  rows: DailyReconRow[];
};

export type DailyReconResponse = {
  gl_posting_active: boolean;
  from_date: string;
  to_date: string;
  total: number;
  days: DailyReconDay[];
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function detailPath(entityType: string, entityId: string): string | null {
  switch (entityType) {
    case "invoice": return `/accounting/invoices/${entityId}`;
    case "bill": return `/accounting/bills?id=${entityId}`;
    case "bill_payment": return `/accounting/bill-payments?id=${entityId}`;
    case "payment": return `/accounting/payments/${entityId}`;
    case "journal_entry": return `/accounting/journal-entries/${entityId}`;
    case "expense": return `/accounting/expenses?id=${entityId}`;
    case "factoring_advance": return `/accounting/factoring?id=${entityId}`;
    default: return null;
  }
}

async function isDailyReconEnabled(client: { query: (sql: string, v?: unknown[]) => Promise<{ rows: unknown[] }> }, operatingCompanyId: string): Promise<boolean> {
  try {
    const tableExists = await client.query(
      `SELECT to_regclass('public.feature_flags') IS NOT NULL AS exists`
    );
    if (!(tableExists.rows[0] as Record<string, unknown>)?.exists) return false;
    const res = await client.query(
      `SELECT value FROM public.feature_flags
       WHERE flag_key = 'GL_POSTING_ENABLED'
         AND (operating_company_id = $1 OR operating_company_id IS NULL)
       ORDER BY operating_company_id NULLS LAST LIMIT 1`,
      [operatingCompanyId]
    );
    const val = String((res.rows[0] as Record<string, unknown>)?.value ?? "false");
    return val === "true" || val === "1";
  } catch {
    return false;
  }
}

async function fetchReconRows(
  client: { query: <T = Record<string, unknown>>(sql: string, v?: unknown[]) => Promise<{ rows: T[] }> },
  operatingCompanyId: string,
  opts: {
    fromDate: string;
    toDate: string;
    entityType?: string;
    matchStatus?: string;
    limit: number;
    offset: number;
  }
): Promise<{ rows: DailyReconRow[]; total: number }> {
  const entityFilter = opts.entityType ? `AND q.entity_type = $4` : "";
  const entityParam: unknown[] = opts.entityType ? [opts.entityType] : [];
  const baseParams: unknown[] = [operatingCompanyId, opts.fromDate, opts.toDate, ...entityParam];

  // Join qbo_sync_queue (QBO side) LEFT JOIN journal_entries (TMS side).
  // We pivot: a row exists when EITHER side has a record in the date range.
  // TMS side: journal_entries entry_date, joined via qbo_journal_entry_id or entity match.
  // QBO side: qbo_sync_queue with qbo_id populated = synced to QBO.
  const sql = `
    WITH tms_je AS (
      SELECT
        je.id                                   AS je_id,
        je.entry_date::text                     AS date,
        je.memo,
        je.status::text                         AS tms_status,
        je.qbo_journal_entry_id                 AS qbo_linked_id,
        COALESCE(
          (SELECT SUM(p.amount_cents) FILTER (WHERE p.debit_or_credit = 'debit')
           FROM accounting.journal_entry_postings p
           WHERE p.journal_entry_uuid = je.id
             AND p.operating_company_id = $1),
          0
        )::bigint                               AS tms_amount_cents
      FROM accounting.journal_entries je
      WHERE je.operating_company_id = $1
        AND je.entry_date BETWEEN $2 AND $3
        AND je.status = 'posted'
    ),
    qbo_queue AS (
      SELECT
        q.entity_type,
        q.entity_id,
        q.sync_status::text                     AS qbo_sync_status,
        q.qbo_id,
        q.error_message                         AS qbo_error,
        q.updated_at::date::text                AS queue_date,
        CASE
          WHEN q.payload_jsonb IS NOT NULL
          THEN (
            SELECT SUM(ABS((line->>'Amount')::numeric * 100))::bigint
            FROM jsonb_array_elements(q.payload_jsonb->'Line') AS line
            WHERE (line->>'Amount') ~ '^[0-9.]+$'
          )
          ELSE NULL
        END                                     AS qbo_amount_cents
      FROM integrations.qbo_sync_queue q
      WHERE q.operating_company_id = $1
        AND q.entity_type IN ('invoice','bill','bill_payment','payment','journal_entry','expense','factoring_advance','credit_memo')
        ${entityFilter}
        AND q.updated_at::date BETWEEN $2 AND $3
    ),
    -- Journal entries linked to queue by qbo_id or je.id = queue entity_id for journal_entry type
    joined AS (
      SELECT
        COALESCE(je.date, q.queue_date)                     AS date,
        q.entity_type,
        q.entity_id,
        je.je_id                                            AS tms_je_id,
        je.tms_amount_cents,
        je.memo                                             AS tms_memo,
        je.tms_status,
        q.qbo_id,
        q.qbo_sync_status,
        q.qbo_amount_cents,
        q.qbo_error,
        CASE
          WHEN je.je_id IS NOT NULL AND q.qbo_id IS NOT NULL
               AND q.qbo_sync_status = 'synced'
               AND (je.tms_amount_cents = q.qbo_amount_cents OR q.qbo_amount_cents IS NULL)
            THEN 'matched'
          WHEN je.je_id IS NOT NULL AND q.qbo_id IS NOT NULL
               AND q.qbo_sync_status = 'synced'
               AND je.tms_amount_cents IS DISTINCT FROM q.qbo_amount_cents
               AND q.qbo_amount_cents IS NOT NULL
            THEN 'amount_mismatch'
          WHEN je.je_id IS NOT NULL
               AND (q.qbo_id IS NULL OR q.qbo_sync_status IN ('pending','in_flight','failed','dead_letter','blocked'))
            THEN 'missing_in_qbo'
          WHEN je.je_id IS NULL AND q.qbo_id IS NOT NULL AND q.qbo_sync_status = 'synced'
            THEN 'missing_in_tms'
          ELSE 'missing_in_qbo'
        END::text                                           AS match_status
      FROM qbo_queue q
      LEFT JOIN tms_je je
        ON (q.entity_type = 'journal_entry' AND je.je_id::text = q.entity_id)
        OR je.qbo_linked_id = q.qbo_id
    )
    SELECT
      date,
      entity_type,
      entity_id,
      tms_je_id::text,
      tms_amount_cents,
      tms_memo,
      tms_status,
      qbo_id,
      qbo_sync_status,
      qbo_amount_cents,
      qbo_error,
      match_status,
      COUNT(*) OVER () AS total_count
    FROM joined
    ${opts.matchStatus && opts.matchStatus !== "all" ? `WHERE match_status = '${opts.matchStatus}'` : ""}
    ORDER BY date DESC, entity_type, entity_id
    LIMIT $${baseParams.length + 1} OFFSET $${baseParams.length + 2}
  `;

  type ReconRow = DailyReconRow & { total_count: string };
  const res = await client.query<ReconRow>(sql, [...baseParams, opts.limit, opts.offset]);

  const total = Number(res.rows[0]?.total_count ?? 0);
  const rows: DailyReconRow[] = res.rows.map((r) => ({
    date: r.date,
    entity_type: r.entity_type,
    entity_id: r.entity_id,
    tms_je_id: r.tms_je_id ?? null,
    tms_amount_cents: r.tms_amount_cents != null ? Number(r.tms_amount_cents) : null,
    tms_memo: r.tms_memo ?? null,
    tms_status: r.tms_status ?? null,
    qbo_id: r.qbo_id ?? null,
    qbo_sync_status: r.qbo_sync_status ?? null,
    qbo_amount_cents: r.qbo_amount_cents != null ? Number(r.qbo_amount_cents) : null,
    qbo_error: r.qbo_error ?? null,
    match_status: r.match_status as DailyReconMatchStatus,
    tms_detail_path: detailPath(r.entity_type, r.entity_id),
  }));

  return { rows, total };
}

async function registerDailyReconRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/daily-recon", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const { operating_company_id, from_date, to_date, entity_type, match_status, limit, offset } = parsed.data;
    const fromDate = from_date ?? daysAgoIso(30);
    const toDate = to_date ?? todayIso();

    return withCompanyScope(user.uuid, operating_company_id, async (client) => {
      const postingEnabled = await isDailyReconEnabled(client, operating_company_id);

      if (!postingEnabled) {
        const response: DailyReconResponse = {
          gl_posting_active: false,
          from_date: fromDate,
          to_date: toDate,
          total: 0,
          days: [],
        };
        return response;
      }

      const { rows, total } = await fetchReconRows(client, operating_company_id, {
        fromDate,
        toDate,
        entityType: entity_type,
        matchStatus: match_status,
        limit,
        offset,
      });

      // Group by date
      const dayMap = new Map<string, DailyReconRow[]>();
      for (const row of rows) {
        const d = row.date ?? "unknown";
        if (!dayMap.has(d)) dayMap.set(d, []);
        dayMap.get(d)!.push(row);
      }

      const days: DailyReconDay[] = Array.from(dayMap.entries())
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([date, dayRows]) => ({
          date,
          all_reconciled: dayRows.every((r) => r.match_status === "matched"),
          rows: dayRows,
        }));

      const response: DailyReconResponse = {
        gl_posting_active: true,
        from_date: fromDate,
        to_date: toDate,
        total,
        days,
      };
      return response;
    });
  });
}

export default fp(registerDailyReconRoutes);
