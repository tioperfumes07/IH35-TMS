// ACCT-F4431380 (Lead 443.137 item 9e, owner ruling: QuickBooks is a READ-ONLY ARCHIVE): the Stage 2
// projection described below is REMOVED. Its entry point now throws QboNativeWriteRefusedError
// (QBO_NATIVE_WRITE_REFUSED); this file writes ONLY its mirror (mdata.qbo_*) and qbo.sync_runs.
// Guard: scripts/verify-qbo-paths-never-write-native-tables.mjs. The Stage 2 text is kept as history.
//
// QBO-EXPENSES-PULL — INBOUND QuickBooks Purchase (cash/card spend) sync (QBO is system-of-record).
//
// Two flag-gated, idempotent stages so the owner can roll out the QBO->TMS expense clone safely:
//
//   Stage 1  pullPurchasesFromQbo()        gated QBO_PURCHASES_MIRROR_PULL_ENABLED   (default OFF)
//            Clones every QBO Purchase into the read-only mirror mdata.qbo_purchases (upsert by qbo_id).
//            Non-destructive: a faithful copy of QBO's spend the owner can verify ties to QBO BEFORE
//            anything touches the expense subledger. The full QBO row is kept in payload_json so Stage 2b
//            can project Purchase.Line[] without a second network round-trip.
//
//   Stage 2  projectPurchasesToExpenses()  gated QBO_EXPENSES_PROJECTION_ENABLED     (default OFF)
//            Stage 2  — projects the mirror header into accounting.expenses (qbo_purchase_id set),
//                       upsert on the partial-unique key uq_expenses_company_qbo_purchase_id.
//            Stage 2b — projects each Purchase line into accounting.expense_lines, upsert on the existing
//                       UNIQUE (expense_id, line_sequence) so it is delete-free (void-not-delete) and
// C6-MONEY-JE-EXEMPT: idempotent. posting_status stays 'unposted' — NO GL/journal posting is performed
//                       here; GL stays QuickBooks' job. The posting engine additionally REFUSES to post
//                       any qbo-sourced expense (EXPENSE_POST_GL_REFUSED) so the parallel-books invariant
//                       (never invent GL for source_system=qbo) can't be violated downstream.
//
// Both flags default OFF (financial cluster — HOLD for owner approval). Stage 1 follows the ap-bills-puller
// G5-2 pattern: HTTP pagination OUTSIDE any DB transaction; upsert in a short txn; qbo.sync_runs audit rows
// commit in their OWN transactions so a data-txn failure cannot roll back the failed audit. Never invents
// mirror rows from TMS expenses. Never writes TMS→QBO.

import type { PoolClient } from "pg";
import { qboCompanyContext, qboPaginateEntity } from "../integrations/qbo/qbo-client.js";
import { withLuciaBypass } from "../auth/db.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import { QBO_PURCHASES_MIRROR_SYNC_KIND, QBO_PURCHASES_EXPENSES_PROJECTION_SYNC_KIND } from "./qbo-purchases-sync-kind.js";
import { recordFlagDisabledMirrorSyncRun } from "./record-flag-disabled-sync-run.js";
import { refuseQboNativeWrite } from "./qbo-native-write-refused.js";

// Default-OFF financial flags (financial cluster — HOLD for owner approval). SINGLE SOURCE OF TRUTH is the
// DB feature flag resolved PER-ENTITY via isEnabled() (lib.feature_flag_overrides keyed on
// operating_company_id) — NOT a process.env var. isEnabled() returns false when the flag row/override is
// absent, so an unregistered flag stays SAFE-OFF.
const PURCHASES_MIRROR_PULL_FLAG = "QBO_PURCHASES_MIRROR_PULL_ENABLED";

export { QBO_PURCHASES_MIRROR_SYNC_KIND, QBO_PURCHASES_EXPENSES_PROJECTION_SYNC_KIND };

export type PurchasesPullResult = {
  enabled: boolean;
  rowsPulled: number;
  rowsUpserted: number;
  pulledAt: string;
};

export type PurchasesProjectResult = {
  enabled: boolean;
  expensesProjected: number;
  linesProjected: number;
  projectedAt: string;
};

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

function refValue(row: Record<string, unknown>, key: string): { value: string | null; name: string | null; type: string | null } {
  const ref = row[key] as Record<string, unknown> | undefined;
  const value = ref?.value != null ? String(ref.value) : null;
  const name = ref?.name != null ? String(ref.name) : null;
  const type = ref?.type != null ? String(ref.type) : null;
  return { value, name, type };
}

async function upsertPurchaseMirror(
  client: PoolClient,
  operatingCompanyId: string,
  row: Record<string, unknown>
): Promise<void> {
  const qboId = String(row.Id ?? "");
  if (!qboId) return;
  const syncToken = row.SyncToken != null ? String(row.SyncToken) : null;
  const docNumber = row.DocNumber != null ? String(row.DocNumber) : null;
  const paymentType = row.PaymentType != null ? String(row.PaymentType) : null;
  const account = refValue(row, "AccountRef");
  const entity = refValue(row, "EntityRef");
  const currency = refValue(row, "CurrencyRef").value;
  const privateNote = row.PrivateNote != null ? String(row.PrivateNote) : null;
  const totalCents = toCents(row.TotalAmt);
  const updated = metaUpdatedAt(row);

  await client.query(
    `
      INSERT INTO mdata.qbo_purchases (
        operating_company_id,
        qbo_id,
        qbo_sync_token,
        doc_number,
        payment_type,
        account_qbo_id,
        account_name,
        entity_qbo_id,
        entity_type,
        entity_name,
        txn_date,
        total_cents,
        currency,
        private_note,
        active,
        qbo_updated_at,
        mirrored_at,
        last_seen_at,
        payload_json,
        updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,true,$15,now(),now(),$16::jsonb,now())
      ON CONFLICT (operating_company_id, qbo_id)
      DO UPDATE SET
        qbo_sync_token = EXCLUDED.qbo_sync_token,
        doc_number = EXCLUDED.doc_number,
        payment_type = EXCLUDED.payment_type,
        account_qbo_id = EXCLUDED.account_qbo_id,
        account_name = EXCLUDED.account_name,
        entity_qbo_id = EXCLUDED.entity_qbo_id,
        entity_type = EXCLUDED.entity_type,
        entity_name = EXCLUDED.entity_name,
        txn_date = EXCLUDED.txn_date,
        total_cents = EXCLUDED.total_cents,
        currency = EXCLUDED.currency,
        private_note = EXCLUDED.private_note,
        active = true,
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
      paymentType,
      account.value,
      account.name,
      entity.value,
      entity.type,
      entity.name,
      asDate(row.TxnDate),
      totalCents,
      currency,
      privateNote,
      updated,
      JSON.stringify(row),
    ]
  );
}

/** Durable audit begin — own COMMIT via withLuciaBypass. Survives later data-txn rollback. */
export async function beginPurchasesMirrorSyncRun(
  operatingCompanyId: string,
  kind: string = QBO_PURCHASES_MIRROR_SYNC_KIND,
  payload: Record<string, unknown> = {
    direction: "qbo_to_tms",
    mirror_table: "mdata.qbo_purchases",
    source_id_key: "qbo_id",
  }
): Promise<string | null> {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    const exists = await client.query<{ ok: boolean }>(`SELECT to_regclass('qbo.sync_runs') IS NOT NULL AS ok`);
    if (!exists.rows[0]?.ok) return null;
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
      [operatingCompanyId, kind, JSON.stringify(payload)]
    );
    return res.rows[0]?.id ?? null;
  });
}

/** Durable audit finish — own COMMIT. Must run even when the upsert txn failed (no failed-audit rollback). */
export async function finishPurchasesMirrorSyncRun(input: {
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
 * Stage 1 — clone QBO Purchases into the read-only mirror mdata.qbo_purchases. Idempotent (upsert by
 * qbo_id). No-op unless QBO_PURCHASES_MIRROR_PULL_ENABLED is ON for this entity.
 *
 * Transaction boundaries (G5-2):
 *   1) flag check — short txn
 *   2) sync_runs running — short txn (COMMIT)
 *   3) QBO HTTP pagination — NO DB connection held
 *   4) mirror upserts — short txn
 *   5) sync_runs success/failed — short txn (COMMIT even if step 4 failed)
 */
export async function pullPurchasesFromQbo(operatingCompanyId: string): Promise<PurchasesPullResult> {
  const pulledAt = new Date().toISOString();

  const enabled = await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    return isEnabled(client, PURCHASES_MIRROR_PULL_FLAG, { operating_company_id: operatingCompanyId });
  });
  if (!enabled) {
    // Durable audit: OFF must not look like a dead cron (no sync_runs row).
    await recordFlagDisabledMirrorSyncRun({
      operatingCompanyId,
      kind: QBO_PURCHASES_MIRROR_SYNC_KIND,
      flagKey: PURCHASES_MIRROR_PULL_FLAG,
      mirrorTable: "mdata.qbo_purchases",
    });
    return { enabled: false, rowsPulled: 0, rowsUpserted: 0, pulledAt };
  }

  const runId = await beginPurchasesMirrorSyncRun(operatingCompanyId);
  let rowsPulled = 0;
  let rowsUpserted = 0;

  try {
    // HTTP outside any pooled write transaction (same as ap-bills-puller G5-2).
    const ctx = await qboCompanyContext(operatingCompanyId);
    const pulledRows: Record<string, unknown>[] = [];
    for await (const page of qboPaginateEntity<Record<string, unknown>>(ctx, "Purchase", "", { pageSize: 1000 })) {
      for (const row of page) {
        rowsPulled += 1;
        pulledRows.push(row);
      }
    }

    await withLuciaBypass(async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
      for (const row of pulledRows) {
        await upsertPurchaseMirror(client, operatingCompanyId, row);
        rowsUpserted += 1;
      }
    });

    await finishPurchasesMirrorSyncRun({
      runId,
      operatingCompanyId,
      success: true,
      recordsProcessed: rowsUpserted,
    });
    return { enabled: true, rowsPulled, rowsUpserted, pulledAt };
  } catch (error) {
    await finishPurchasesMirrorSyncRun({
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

type PurchaseLine = {
  amountCents: number;
  description: string | null;
  accountQboId: string | null;
};

/** Parse a QBO Purchase.Line[] into positive-amount expense lines (AccountBased + ItemBased). */
export function parsePurchaseLines(payload: unknown): PurchaseLine[] {
  const row = (payload ?? {}) as Record<string, unknown>;
  const rawLines = Array.isArray(row.Line) ? (row.Line as Record<string, unknown>[]) : [];
  const lines: PurchaseLine[] = [];
  for (const raw of rawLines) {
    const amountCents = toCents(raw.Amount);
    if (amountCents <= 0) continue; // skip zero / negative (discount) lines — subledger detail, not GL.
    const detailType = raw.DetailType != null ? String(raw.DetailType) : "";
    let accountQboId: string | null = null;
    if (detailType === "AccountBasedExpenseLineDetail") {
      const detail = raw.AccountBasedExpenseLineDetail as Record<string, unknown> | undefined;
      const acct = detail?.AccountRef as Record<string, unknown> | undefined;
      accountQboId = acct?.value != null ? String(acct.value) : null;
    }
    // ItemBasedExpenseLineDetail carries an ItemRef (no direct GL account) — captured with null account.
    const description = raw.Description != null ? String(raw.Description) : null;
    lines.push({ amountCents, description, accountQboId });
  }
  return lines;
}

/**
 * ACCT-F4431380 (Lead 443.137 item 9e) — REFUSED BY NAME. This formerly projected mdata.qbo_purchases into accounting.expenses + accounting.expense_lines.
 * QuickBooks is a read-only archive: a QBO path writes only its mirror table, never a native money/master
 * table. Throws QboNativeWriteRefusedError (code QBO_NATIVE_WRITE_REFUSED) instead of returning a
 * "0 rows projected" result a caller could mistake for success. The mirror (mdata.qbo_purchases) is kept and still
 * filled by the pull stage; native records are created only through the TMS service layer.
 */
export async function projectPurchasesToExpenses(operatingCompanyId: string): Promise<PurchasesProjectResult> {
  return refuseQboNativeWrite(
    "qbo-sync/qbo-purchases-puller#projectPurchasesToExpenses",
    ["accounting.expenses", "accounting.expense_lines"],
    operatingCompanyId
  );
}
