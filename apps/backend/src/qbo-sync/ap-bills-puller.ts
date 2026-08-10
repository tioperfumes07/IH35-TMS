// QBO-AP-PULL — INBOUND QuickBooks A/P (Bill) sync (QBO is system-of-record).
//
// Two flag-gated, idempotent stages so the owner can roll out the QBO->TMS A/P clone safely:
//
//   Stage 1  pullApBillsFromQbo()      gated QBO_AP_MIRROR_PULL_ENABLED       (default OFF)
//            Clones every QBO Bill into the read-only mirror mdata.qbo_ap_bills (upsert by qbo_id).
//            Non-destructive: a faithful copy of QBO's open A/P the owner can verify ties to QBO
//            BEFORE anything touches the accounting ledger.
//
//   Stage 2  projectApBillsToLedger()   gated QBO_AP_BILLS_PROJECTION_ENABLED  (default OFF)
//            Projects the mirror into accounting.bills (source_system='qbo'), upsert by the existing
//            uq_bills_company_qbo_bill_id key, so views.ap_aging / FIN-20 finally reflect QBO's real
//            A/P. void-not-delete: rows are only ever upserted, never deleted. NO GL/journal posting
//            is performed here — this only populates the A/P subledger; GL stays QBO's job.
//
//   Stage 2b projectApBillLinesToLedger()  same flag
//            Projects payload_json->'Line' into accounting.bill_lines for QBO-sourced bills.
//            Root cause of bill_lines≈1 vs bills≈16k was header-only Stage 2. Mirror already stores
//            the full QBO Bill JSON including Line[]. Idempotent delete+insert scoped to
//            source_system='qbo' only — never touches TMS-native lines. NO GL poster.
//
// Both flags default OFF (financial cluster — HOLD for owner approval). Stage 1 follows the G5-2
// customers-puller pattern: HTTP pagination OUTSIDE any DB transaction; upsert in a short txn;
// qbo.sync_runs audit rows commit in their OWN transactions so a data-txn failure cannot roll back
// the failed audit. Never invents mirror rows from TMS bills. Never writes TMS→QBO.

import type { PoolClient } from "pg";
import { qboCompanyContext, qboPaginateEntity } from "../integrations/qbo/qbo-client.js";
import { withLuciaBypass } from "../auth/db.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import { AP_BILLS_MIRROR_SYNC_KIND } from "./ap-bills-sync-kind.js";
import { recordFlagDisabledMirrorSyncRun } from "./record-flag-disabled-sync-run.js";

// Default-OFF financial flags (financial cluster — HOLD for owner approval). SINGLE SOURCE OF TRUTH
// is the DB feature flag resolved PER-ENTITY via isEnabled() (lib.feature_flag_overrides keyed on
// operating_company_id) — NOT a process.env var. This removes the prior hidden env dependency so a
// stage turns on for an entity only when that entity has an ON override; isEnabled() returns false
// when the flag row/override is absent, so an unregistered flag stays SAFE-OFF.
const AP_MIRROR_PULL_FLAG = "QBO_AP_MIRROR_PULL_ENABLED";
const AP_BILLS_PROJECTION_FLAG = "QBO_AP_BILLS_PROJECTION_ENABLED";

export { AP_BILLS_MIRROR_SYNC_KIND };

export type ApBillsPullResult = {
  enabled: boolean;
  rowsPulled: number;
  rowsUpserted: number;
  pulledAt: string;
};

export type ApBillLinesProjectResult = {
  enabled: boolean;
  /** Rows touched by upsert (insert + real updates). No-ops with identical values are not counted. */
  linesProjected: number;
  /** QBO-sourced bill_lines removed because they no longer appear in payload_json money lines. */
  linesOrphanDeleted: number;
  linesUnmappedAccount: number;
  linesUnmappedItem: number;
  headerLineSumMismatch: number;
  projectedAt: string;
};

export type ApBillsProjectResult = {
  enabled: boolean;
  rowsProjected: number;
  projectedAt: string;
  lines: ApBillLinesProjectResult;
};

/** Detail types that carry money on a QBO Bill. DescriptionOnly is skipped (no amount economics). */
export const QBO_BILL_MONEY_LINE_DETAIL_TYPES = [
  "AccountBasedExpenseLineDetail",
  "ItemBasedExpenseLineDetail",
] as const;

export type QboBillMoneyLineDetailType = (typeof QBO_BILL_MONEY_LINE_DETAIL_TYPES)[number];

/** Pure helper — kept exportable for unit tests (no DB). */
export function isQboBillMoneyLineDetailType(detailType: unknown): detailType is QboBillMoneyLineDetailType {
  return (
    detailType === "AccountBasedExpenseLineDetail" || detailType === "ItemBasedExpenseLineDetail"
  );
}

/**
 * Pure helper: extract AccountRef / ItemRef ids from one QBO Line object.
 * Never invents amounts from the bill header — caller must skip when Line[] is missing.
 */
export function parseQboBillLineRefs(line: Record<string, unknown>): {
  detailType: string;
  accountQboId: string | null;
  itemQboId: string | null;
  amount: number | null;
  description: string | null;
  lineNum: number | null;
} {
  const detailType = line.DetailType != null ? String(line.DetailType) : "";
  const amountRaw = line.Amount;
  const amount =
    typeof amountRaw === "number"
      ? amountRaw
      : amountRaw != null && Number.isFinite(Number(amountRaw))
        ? Number(amountRaw)
        : null;
  const description = line.Description != null ? String(line.Description) : null;
  const lineNumRaw = line.LineNum ?? line.Id;
  const lineNum =
    lineNumRaw != null && Number.isFinite(Number(lineNumRaw)) ? Math.trunc(Number(lineNumRaw)) : null;

  let accountQboId: string | null = null;
  let itemQboId: string | null = null;
  if (detailType === "AccountBasedExpenseLineDetail") {
    const detail = line.AccountBasedExpenseLineDetail as Record<string, unknown> | undefined;
    const ref = detail?.AccountRef as Record<string, unknown> | undefined;
    accountQboId = ref?.value != null ? String(ref.value) : null;
  } else if (detailType === "ItemBasedExpenseLineDetail") {
    const detail = line.ItemBasedExpenseLineDetail as Record<string, unknown> | undefined;
    const ref = detail?.ItemRef as Record<string, unknown> | undefined;
    itemQboId = ref?.value != null ? String(ref.value) : null;
  }

  return { detailType, accountQboId, itemQboId, amount, description, lineNum };
}

function metaUpdatedAt(row: Record<string, unknown>): Date | null {
  const meta = row.MetaData as Record<string, unknown> | undefined;
  const raw = meta?.LastUpdatedTime;
  if (typeof raw !== "string") return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}

function toCents(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function asDate(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  // QBO ships dates as YYYY-MM-DD already; keep the date part only.
  return raw.trim().slice(0, 10);
}

function refValue(row: Record<string, unknown>, key: string): { value: string | null; name: string | null } {
  const ref = row[key] as Record<string, unknown> | undefined;
  const value = ref?.value != null ? String(ref.value) : null;
  const name = ref?.name != null ? String(ref.name) : null;
  return { value, name };
}

async function upsertApBillMirror(
  client: PoolClient,
  operatingCompanyId: string,
  row: Record<string, unknown>
): Promise<void> {
  const qboId = String(row.Id ?? "");
  if (!qboId) return;
  const syncToken = row.SyncToken != null ? String(row.SyncToken) : null;
  const docNumber = row.DocNumber != null ? String(row.DocNumber) : null;
  const vendor = refValue(row, "VendorRef");
  const currency = refValue(row, "CurrencyRef").value;
  const privateNote = row.PrivateNote != null ? String(row.PrivateNote) : null;
  const totalCents = toCents(row.TotalAmt);
  // QBO omits Balance on fully-paid bills — absence means nothing open.
  const balanceCents = row.Balance === undefined ? 0 : toCents(row.Balance);
  const active = row.Active === undefined ? true : Boolean(row.Active);
  const updated = metaUpdatedAt(row);

  await client.query(
    `
      INSERT INTO mdata.qbo_ap_bills (
        operating_company_id,
        qbo_id,
        qbo_sync_token,
        doc_number,
        vendor_qbo_id,
        vendor_name,
        txn_date,
        due_date,
        total_cents,
        balance_cents,
        currency,
        private_note,
        active,
        qbo_updated_at,
        mirrored_at,
        last_seen_at,
        payload_json,
        updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now(),now(),$15::jsonb,now())
      ON CONFLICT (operating_company_id, qbo_id)
      DO UPDATE SET
        qbo_sync_token = EXCLUDED.qbo_sync_token,
        doc_number = EXCLUDED.doc_number,
        vendor_qbo_id = EXCLUDED.vendor_qbo_id,
        vendor_name = EXCLUDED.vendor_name,
        txn_date = EXCLUDED.txn_date,
        due_date = EXCLUDED.due_date,
        total_cents = EXCLUDED.total_cents,
        balance_cents = EXCLUDED.balance_cents,
        currency = EXCLUDED.currency,
        private_note = EXCLUDED.private_note,
        active = EXCLUDED.active,
        qbo_updated_at = EXCLUDED.qbo_updated_at,
        mirrored_at = now(),
        last_seen_at = now(),
        payload_json = EXCLUDED.payload_json,
        updated_at = now()
    `,
    [
      operatingCompanyId,
      qboId,
      syncToken,
      docNumber,
      vendor.value,
      vendor.name,
      asDate(row.TxnDate),
      asDate(row.DueDate),
      totalCents,
      balanceCents,
      currency,
      privateNote,
      active,
      updated,
      JSON.stringify(row),
    ]
  );
}

/** Durable audit begin — own COMMIT via withLuciaBypass. Survives later data-txn rollback. */
export async function beginApMirrorSyncRun(operatingCompanyId: string): Promise<string | null> {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    const exists = await client.query<{ ok: boolean }>(`SELECT to_regclass('qbo.sync_runs') IS NOT NULL AS ok`);
    if (!exists.rows[0]?.ok) return null;
    // Schema (0162+0163): id, operating_company_id, kind, status∈(pending|running|success|failed|…),
    // started_at, completed_at, error_message, records_processed, payload jsonb, retry_count, …
    const res = await client.query<{ id: string }>(
      `
        INSERT INTO qbo.sync_runs (
          operating_company_id,
          kind,
          status,
          started_at,
          records_processed,
          payload
        )
        VALUES ($1, $2, 'running', now(), 0, $3::jsonb)
        RETURNING id::text
      `,
      [
        operatingCompanyId,
        AP_BILLS_MIRROR_SYNC_KIND,
        JSON.stringify({
          direction: "qbo_to_tms",
          mirror_table: "mdata.qbo_ap_bills",
          source_id_key: "qbo_id",
        }),
      ]
    );
    return res.rows[0]?.id ?? null;
  });
}

/** Durable audit finish — own COMMIT. Must run even when the upsert txn failed (no failed-audit rollback). */
export async function finishApMirrorSyncRun(input: {
  runId: string | null;
  operatingCompanyId: string;
  success: boolean;
  recordsProcessed: number;
  errorMessage?: string | null;
}): Promise<void> {
  if (!input.runId) return;
  await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operatingCompanyId]);
    await client.query(
      `
        UPDATE qbo.sync_runs
        SET status = $3,
            completed_at = now(),
            records_processed = $4,
            error_message = $5
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
          AND status = 'running'
      `,
      [
        input.runId,
        input.operatingCompanyId,
        input.success ? "success" : "failed",
        input.recordsProcessed,
        input.errorMessage ?? null,
      ]
    );
  });
}

/**
 * Stage 1 — clone QBO Bills into the read-only mirror mdata.qbo_ap_bills. Idempotent (upsert by
 * qbo_id). No-op unless QBO_AP_MIRROR_PULL_ENABLED is ON for this entity.
 *
 * Transaction boundaries (G5-2):
 *   1) flag check — short txn
 *   2) sync_runs running — short txn (COMMIT)
 *   3) QBO HTTP pagination — NO DB connection held
 *   4) mirror upserts — short txn
 *   5) sync_runs success/failed — short txn (COMMIT even if step 4 failed)
 */
export async function pullApBillsFromQbo(operatingCompanyId: string): Promise<ApBillsPullResult> {
  const pulledAt = new Date().toISOString();

  const enabled = await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    return isEnabled(client, AP_MIRROR_PULL_FLAG, { operating_company_id: operatingCompanyId });
  });
  if (!enabled) {
    // Durable audit: OFF must not look like a dead cron (no sync_runs row).
    await recordFlagDisabledMirrorSyncRun({
      operatingCompanyId,
      kind: AP_BILLS_MIRROR_SYNC_KIND,
      flagKey: AP_MIRROR_PULL_FLAG,
      mirrorTable: "mdata.qbo_ap_bills",
    });
    return { enabled: false, rowsPulled: 0, rowsUpserted: 0, pulledAt };
  }

  const runId = await beginApMirrorSyncRun(operatingCompanyId);
  let rowsPulled = 0;
  let rowsUpserted = 0;

  try {
    // HTTP outside any pooled write transaction (same as customers-puller G5-2).
    const ctx = await qboCompanyContext(operatingCompanyId);
    const pulledRows: Record<string, unknown>[] = [];
    for await (const page of qboPaginateEntity<Record<string, unknown>>(ctx, "Bill", "", { pageSize: 1000 })) {
      for (const row of page) {
        rowsPulled += 1;
        pulledRows.push(row);
      }
    }

    await withLuciaBypass(async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
      for (const row of pulledRows) {
        await upsertApBillMirror(client, operatingCompanyId, row);
        rowsUpserted += 1;
      }
    });

    await finishApMirrorSyncRun({
      runId,
      operatingCompanyId,
      success: true,
      recordsProcessed: rowsUpserted,
    });
    return { enabled: true, rowsPulled, rowsUpserted, pulledAt };
  } catch (error) {
    // Failed audit must COMMIT independently — never share a txn with the rolled-back upsert.
    await finishApMirrorSyncRun({
      runId,
      operatingCompanyId,
      success: false,
      recordsProcessed: rowsUpserted,
      errorMessage: String((error as Error)?.message ?? error),
    }).catch(() => {
      /* audit best-effort; rethrow original */
    });
    throw error;
  }
}

/**
 * Stage 2b — project QBO Bill Line[] from mdata.qbo_ap_bills.payload_json into accounting.bill_lines.
 *
 * Incremental / scheduler-safe:
 *   1) UPSERT money lines from payload_json (ON CONFLICT), updating only when values IS DISTINCT FROM
 *      so identical re-runs do not thrash audit.row_changes / trg_audit_bill_lines.
 *   2) DELETE only orphan QBO lines that no longer appear in the payload (NOT EXISTS), never a
 *      company-wide wipe of all QBO bill_lines each 4h tick.
 *
 * Never touches TMS-native bill lines. Never invents a single line from header totals when Line is
 * missing. Never calls the GL poster.
 *
 * AccountBased → catalogs.accounts via qbo_account_id.
 * ItemBased → catalogs.items.default_expense_account_id when qbo_item_id matches; else account_id NULL.
 */
export async function projectApBillLinesToLedger(
  operatingCompanyId: string,
  opts?: { skipFlagCheck?: boolean }
): Promise<ApBillLinesProjectResult> {
  const projectedAt = new Date().toISOString();
  const empty: ApBillLinesProjectResult = {
    enabled: false,
    linesProjected: 0,
    linesOrphanDeleted: 0,
    linesUnmappedAccount: 0,
    linesUnmappedItem: 0,
    headerLineSumMismatch: 0,
    projectedAt,
  };

  // Safe line_sequence: non-numeric LineNum/Id must not abort the whole txn (::int cast).
  const lineSeqSql = `
    COALESCE(
      CASE
        WHEN (line->>'LineNum') ~ '^[0-9]+$' AND (line->>'LineNum')::int > 0
          THEN (line->>'LineNum')::int
      END,
      CASE
        WHEN (line->>'Id') ~ '^[0-9]+$' AND (line->>'Id')::int > 0
          THEN (line->>'Id')::int
      END,
      t.ordinality::int
    )
  `;

  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    const enabled =
      opts?.skipFlagCheck === true
        ? true
        : await isEnabled(client, AP_BILLS_PROJECTION_FLAG, {
            operating_company_id: operatingCompanyId,
          });
    if (!enabled) return empty;

    const insertRes = await client.query(
      `
        INSERT INTO accounting.bill_lines (
          bill_id,
          line_sequence,
          amount,
          description,
          section,
          account_id
        )
        SELECT
          b.id AS bill_id,
          ${lineSeqSql} AS line_sequence,
          COALESCE((NULLIF(line->>'Amount', ''))::numeric, 0) AS amount,
          NULLIF(line->>'Description', '') AS description,
          'A' AS section,
          CASE
            WHEN line->>'DetailType' = 'AccountBasedExpenseLineDetail' THEN acct.id
            WHEN line->>'DetailType' = 'ItemBasedExpenseLineDetail' THEN COALESCE(item_acct.id, qbo_item_acct.id)
            ELSE NULL
          END AS account_id
        FROM accounting.bills b
        INNER JOIN mdata.qbo_ap_bills m
          ON m.operating_company_id = b.operating_company_id
         AND m.qbo_id = b.qbo_bill_id
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(m.payload_json->'Line') = 'array' THEN m.payload_json->'Line'
            ELSE '[]'::jsonb
          END
        ) WITH ORDINALITY AS t(line, ordinality)
        LEFT JOIN catalogs.accounts acct
          ON acct.operating_company_id = b.operating_company_id
         AND acct.qbo_account_id = line->'AccountBasedExpenseLineDetail'->'AccountRef'->>'value'
         AND acct.deactivated_at IS NULL
        LEFT JOIN catalogs.items ci
          ON ci.operating_company_id = b.operating_company_id
         AND ci.qbo_item_id = line->'ItemBasedExpenseLineDetail'->'ItemRef'->>'value'
        LEFT JOIN catalogs.accounts item_acct
          ON item_acct.id = ci.default_expense_account_id
         AND item_acct.operating_company_id = b.operating_company_id
         AND item_acct.deactivated_at IS NULL
        LEFT JOIN mdata.qbo_items qi
          ON qi.operating_company_id = b.operating_company_id
         AND qi.qbo_id = line->'ItemBasedExpenseLineDetail'->'ItemRef'->>'value'
        LEFT JOIN catalogs.accounts qbo_item_acct
          ON qbo_item_acct.operating_company_id = b.operating_company_id
         AND qbo_item_acct.qbo_account_id = qi.payload_json->'ExpenseAccountRef'->>'value'
         AND qbo_item_acct.deactivated_at IS NULL
        WHERE b.operating_company_id = $1::uuid
          AND b.source_system = 'qbo'
          AND line->>'DetailType' IN ('AccountBasedExpenseLineDetail', 'ItemBasedExpenseLineDetail')
        ON CONFLICT (bill_id, line_sequence) DO UPDATE SET
          amount = EXCLUDED.amount,
          description = EXCLUDED.description,
          account_id = EXCLUDED.account_id,
          section = EXCLUDED.section,
          -- F9-02 — resurrect if QBO brings the line back after an orphan void.
          voided_at = NULL,
          voided_reason = NULL
        WHERE accounting.bill_lines.amount IS DISTINCT FROM EXCLUDED.amount
           OR accounting.bill_lines.description IS DISTINCT FROM EXCLUDED.description
           OR accounting.bill_lines.account_id IS DISTINCT FROM EXCLUDED.account_id
           OR accounting.bill_lines.section IS DISTINCT FROM EXCLUDED.section
           OR accounting.bill_lines.voided_at IS NOT NULL
      `,
      [operatingCompanyId]
    );

    // F9-02 — void orphans; never hard-DELETE money lines (audit evidence).
    const orphanRes = await client.query(
      `
        UPDATE accounting.bill_lines bl
           SET voided_at = COALESCE(bl.voided_at, now()),
               voided_reason = COALESCE(bl.voided_reason, 'qbo_orphan_superseded')
        FROM accounting.bills b
        WHERE bl.bill_id = b.id
          AND b.operating_company_id = $1::uuid
          AND b.source_system = 'qbo'
          AND bl.voided_at IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM mdata.qbo_ap_bills m
            CROSS JOIN LATERAL jsonb_array_elements(
              CASE
                WHEN jsonb_typeof(m.payload_json->'Line') = 'array' THEN m.payload_json->'Line'
                ELSE '[]'::jsonb
              END
            ) WITH ORDINALITY AS t(line, ordinality)
            WHERE m.operating_company_id = b.operating_company_id
              AND m.qbo_id = b.qbo_bill_id
              AND line->>'DetailType' IN ('AccountBasedExpenseLineDetail', 'ItemBasedExpenseLineDetail')
              AND (${lineSeqSql}) = bl.line_sequence
          )
      `,
      [operatingCompanyId]
    );

    const linesProjected = insertRes.rowCount ?? 0;
    const linesOrphanDeleted = orphanRes.rowCount ?? 0; // retained field name = voided count (API compat)

    const unmapped = await client.query<{
      lines_unmapped_account: string;
      lines_unmapped_item: string;
    }>(
      `
        WITH money_lines AS (
          SELECT
            b.id AS bill_id,
            line->>'DetailType' AS detail_type,
            ${lineSeqSql} AS line_sequence
          FROM accounting.bills b
          INNER JOIN mdata.qbo_ap_bills m
            ON m.operating_company_id = b.operating_company_id
           AND m.qbo_id = b.qbo_bill_id
          CROSS JOIN LATERAL jsonb_array_elements(
            CASE
              WHEN jsonb_typeof(m.payload_json->'Line') = 'array' THEN m.payload_json->'Line'
              ELSE '[]'::jsonb
            END
          ) WITH ORDINALITY AS t(line, ordinality)
          WHERE b.operating_company_id = $1::uuid
            AND b.source_system = 'qbo'
            AND line->>'DetailType' IN ('AccountBasedExpenseLineDetail', 'ItemBasedExpenseLineDetail')
        )
        SELECT
          count(*) FILTER (
            WHERE ml.detail_type = 'AccountBasedExpenseLineDetail' AND bl.account_id IS NULL
          )::int AS lines_unmapped_account,
          count(*) FILTER (
            WHERE ml.detail_type = 'ItemBasedExpenseLineDetail' AND bl.account_id IS NULL
          )::int AS lines_unmapped_item
        FROM money_lines ml
        INNER JOIN accounting.bill_lines bl
          ON bl.bill_id = ml.bill_id
         AND bl.line_sequence = ml.line_sequence
      `,
      [operatingCompanyId]
    );

    const mismatch = await client.query<{ n: string }>(
      `
        SELECT count(*)::int AS n
        FROM accounting.bills b
        WHERE b.operating_company_id = $1::uuid
          AND b.source_system = 'qbo'
          AND ABS(
            COALESCE(b.amount_cents, 0)
            - COALESCE((
                SELECT ROUND(SUM(bl.amount) * 100)::bigint
                FROM accounting.bill_lines bl
                WHERE bl.bill_id = b.id
                  AND bl.voided_at IS NULL
              ), 0)
          ) > 1
      `,
      [operatingCompanyId]
    );

    return {
      enabled: true,
      linesProjected,
      linesOrphanDeleted,
      linesUnmappedAccount: Number(unmapped.rows[0]?.lines_unmapped_account ?? 0),
      linesUnmappedItem: Number(unmapped.rows[0]?.lines_unmapped_item ?? 0),
      headerLineSumMismatch: Number(mismatch.rows[0]?.n ?? 0),
      projectedAt,
    };
  });
}

/**
 * Stage 2 — project the QBO A/P mirror into accounting.bills (source_system='qbo'). Set-based,
 * idempotent upsert on the existing uq_bills_company_qbo_bill_id key. Vendor linkage resolves
 * mdata.vendors via qbo_vendor_id so the aging view can render names. Bills with no positive total
 * are skipped (accounting.bills enforces amount_cents > 0). No-op unless the QBO_AP_BILLS_PROJECTION_ENABLED feature flag is ON for this entity.
 *
 * After headers, projects bill_lines from payload_json (Stage 2b). NO GL/journal posting.
 */
export async function projectApBillsToLedger(operatingCompanyId: string): Promise<ApBillsProjectResult> {
  const projectedAt = new Date().toISOString();

  let enabled = false;
  let rowsProjected = 0;

  await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    enabled = await isEnabled(client, AP_BILLS_PROJECTION_FLAG, {
      operating_company_id: operatingCompanyId,
    });
    if (!enabled) return;
    const res = await client.query(
      `
        INSERT INTO accounting.bills (
          operating_company_id,
          source_system,
          qbo_bill_id,
          qbo_sync_token,
          vendor_id,
          vendor_uuid,
          bill_number,
          bill_date,
          due_date,
          amount_cents,
          total_amount,
          paid_cents,
          paid_amount,
          status,
          memo,
          last_qbo_synced_at,
          qbo_sync_pending,
          created_at,
          updated_at
        )
        SELECT
          m.operating_company_id,
          'qbo',
          m.qbo_id,
          m.qbo_sync_token,
          m.vendor_qbo_id,
          v.id::text,
          m.doc_number,
          COALESCE(m.txn_date, CURRENT_DATE),
          m.due_date,
          m.total_cents,
          (m.total_cents / 100.0),
          GREATEST(m.total_cents - m.balance_cents, 0),
          (GREATEST(m.total_cents - m.balance_cents, 0) / 100.0),
          CASE
            WHEN m.balance_cents <= 0 THEN 'paid'
            WHEN m.balance_cents >= m.total_cents THEN 'unpaid'
            ELSE 'partial'
          END,
          m.private_note,
          now(),
          false,
          now(),
          now()
        FROM mdata.qbo_ap_bills m
        LEFT JOIN mdata.vendors v
          ON v.operating_company_id = m.operating_company_id
         AND v.qbo_vendor_id = m.vendor_qbo_id
        WHERE m.operating_company_id = $1::uuid
          AND m.total_cents > 0
        ON CONFLICT (operating_company_id, qbo_bill_id) WHERE qbo_bill_id IS NOT NULL
        DO UPDATE SET
          qbo_sync_token = EXCLUDED.qbo_sync_token,
          vendor_id = EXCLUDED.vendor_id,
          vendor_uuid = EXCLUDED.vendor_uuid,
          bill_number = EXCLUDED.bill_number,
          bill_date = EXCLUDED.bill_date,
          due_date = EXCLUDED.due_date,
          amount_cents = EXCLUDED.amount_cents,
          total_amount = EXCLUDED.total_amount,
          paid_cents = EXCLUDED.paid_cents,
          paid_amount = EXCLUDED.paid_amount,
          status = EXCLUDED.status,
          memo = EXCLUDED.memo,
          last_qbo_synced_at = now(),
          updated_at = now()
        WHERE accounting.bills.source_system = 'qbo'
      `,
      [operatingCompanyId]
    );
    rowsProjected = res.rowCount ?? 0;
  });

  if (!enabled) {
    return {
      enabled: false,
      rowsProjected: 0,
      projectedAt,
      lines: {
        enabled: false,
        linesProjected: 0,
        linesOrphanDeleted: 0,
        linesUnmappedAccount: 0,
        linesUnmappedItem: 0,
        headerLineSumMismatch: 0,
        projectedAt,
      },
    };
  }

  // Flag already proven ON in this call — skip re-check so lines share the same gate decision.
  const lines = await projectApBillLinesToLedger(operatingCompanyId, { skipFlagCheck: true });
  return { enabled: true, rowsProjected, projectedAt, lines };
}
