// ACCT-F4431380 (Lead 443.137 item 9e, owner ruling: QuickBooks is a READ-ONLY ARCHIVE): the Stage 2
// projection described below is REMOVED. Its entry point now throws QboNativeWriteRefusedError
// (QBO_NATIVE_WRITE_REFUSED); this file writes ONLY its mirror (mdata.qbo_*) and qbo.sync_runs.
// Guard: scripts/verify-qbo-paths-never-write-native-tables.mjs. The Stage 2 text is kept as history.
//
// ACCT-F47 / ACCT-ECON-05 — INBOUND QuickBooks VendorCredit sync (QBO is system-of-record).
//
// Two flag-gated, idempotent stages (same architecture as purchases / AR payments):
//
//   Stage 1  pullVendorCreditsFromQbo()        gated QBO_VENDOR_CREDIT_MIRROR_PULL_ENABLED   (default OFF)
//            Clones every QBO VendorCredit into mdata.qbo_vendor_credits (upsert by qbo_id).
//
//   Stage 2  projectVendorCreditsToLedger()    gated QBO_VENDOR_CREDITS_PROJECTION_ENABLED    (default OFF)
//            Projects the mirror into accounting.vendor_credits (qbo_id + source_system='qbo').
//            SUBLEDGER ONLY — NO GL. Vendors that do not resolve to mdata.vendors are SKIPPED.
//            display_id must match ^VC-[0-9]{4}-[0-9]{4}$ (set-based year+seq for new rows only).
//            amount_unapplied_cents is GENERATED ALWAYS — never inserted.
//
// Both flags default OFF. Stage 1 follows the purchases G5-2 pattern: HTTP pagination OUTSIDE any DB
// transaction; upsert in a short txn; qbo.sync_runs audit in its OWN transactions.

import type { PoolClient } from "pg";
import { qboCompanyContext, qboPaginateEntity } from "../integrations/qbo/qbo-client.js";
import { withLuciaBypass } from "../auth/db.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import {
  QBO_VENDOR_CREDITS_MIRROR_SYNC_KIND,
  QBO_VENDOR_CREDITS_PROJECTION_SYNC_KIND,
} from "./qbo-vendor-credits-sync-kind.js";
import { recordFlagDisabledMirrorSyncRun } from "./record-flag-disabled-sync-run.js";
import { refuseQboNativeWrite } from "./qbo-native-write-refused.js";

const MIRROR_PULL_FLAG = "QBO_VENDOR_CREDIT_MIRROR_PULL_ENABLED";

export { QBO_VENDOR_CREDITS_MIRROR_SYNC_KIND, QBO_VENDOR_CREDITS_PROJECTION_SYNC_KIND };

export type VendorCreditsPullResult = {
  enabled: boolean;
  rowsPulled: number;
  rowsUpserted: number;
  pulledAt: string;
};

export type VendorCreditsProjectResult = {
  enabled: boolean;
  creditsProjected: number;
  vendorsUnresolved: number;
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
  return raw.trim().slice(0, 10);
}

function refValue(row: Record<string, unknown>, key: string): { value: string | null; name: string | null } {
  const ref = row[key] as Record<string, unknown> | undefined;
  const value = ref?.value != null ? String(ref.value) : null;
  const name = ref?.name != null ? String(ref.name) : null;
  return { value, name };
}

async function upsertVendorCreditMirror(
  client: PoolClient,
  operatingCompanyId: string,
  row: Record<string, unknown>
): Promise<void> {
  const qboId = String(row.Id ?? "");
  if (!qboId) return;
  const syncToken = row.SyncToken != null ? String(row.SyncToken) : null;
  const docNumber = row.DocNumber != null ? String(row.DocNumber) : null;
  const vendor = refValue(row, "VendorRef");
  const apAccount = refValue(row, "APAccountRef");
  const currency = refValue(row, "CurrencyRef").value;
  const privateNote = row.PrivateNote != null ? String(row.PrivateNote) : null;
  const totalCents = toCents(row.TotalAmt);
  const balanceCents = toCents(row.Balance);
  const linked = Array.isArray(row.LinkedTxn) ? (row.LinkedTxn as unknown[]).length : 0;
  const updated = metaUpdatedAt(row);

  await client.query(
    `
      INSERT INTO mdata.qbo_vendor_credits (
        operating_company_id,
        qbo_id,
        qbo_sync_token,
        doc_number,
        vendor_qbo_id,
        vendor_name,
        ap_account_qbo_id,
        ap_account_name,
        txn_date,
        total_cents,
        balance_cents,
        currency,
        private_note,
        linked_txn_count,
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
        vendor_qbo_id = EXCLUDED.vendor_qbo_id,
        vendor_name = EXCLUDED.vendor_name,
        ap_account_qbo_id = EXCLUDED.ap_account_qbo_id,
        ap_account_name = EXCLUDED.ap_account_name,
        txn_date = EXCLUDED.txn_date,
        total_cents = EXCLUDED.total_cents,
        balance_cents = EXCLUDED.balance_cents,
        currency = EXCLUDED.currency,
        private_note = EXCLUDED.private_note,
        linked_txn_count = EXCLUDED.linked_txn_count,
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
      vendor.value,
      vendor.name,
      apAccount.value,
      apAccount.name,
      asDate(row.TxnDate),
      totalCents,
      balanceCents,
      currency,
      privateNote,
      linked,
      updated,
      JSON.stringify(row),
    ]
  );
}

async function beginVendorCreditSyncRun(
  operatingCompanyId: string,
  kind: string,
  payload: Record<string, unknown>
): Promise<string | null> {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    const exists = await client.query<{ ok: boolean }>(`SELECT to_regclass('qbo.sync_runs') IS NOT NULL AS ok`);
    if (!exists.rows[0]?.ok) return null;
    const res = await client.query<{ id: string }>(
      `
        INSERT INTO qbo.sync_runs (
          operating_company_id, kind, status, started_at, records_processed, payload
        )
        VALUES ($1, $2, 'running', now(), 0, $3::jsonb)
        RETURNING id::text
      `,
      [operatingCompanyId, kind, JSON.stringify(payload)]
    );
    return res.rows[0]?.id ?? null;
  });
}

async function finishVendorCreditSyncRun(input: {
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
 * Stage 1 — clone QBO VendorCredits into mdata.qbo_vendor_credits. Idempotent (upsert by qbo_id).
 * No-op unless QBO_VENDOR_CREDIT_MIRROR_PULL_ENABLED is ON for this entity.
 */
export async function pullVendorCreditsFromQbo(operatingCompanyId: string): Promise<VendorCreditsPullResult> {
  const pulledAt = new Date().toISOString();

  const enabled = await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    return isEnabled(client, MIRROR_PULL_FLAG, { operating_company_id: operatingCompanyId });
  });
  if (!enabled) {
    await recordFlagDisabledMirrorSyncRun({
      operatingCompanyId,
      kind: QBO_VENDOR_CREDITS_MIRROR_SYNC_KIND,
      flagKey: MIRROR_PULL_FLAG,
      mirrorTable: "mdata.qbo_vendor_credits",
    });
    return { enabled: false, rowsPulled: 0, rowsUpserted: 0, pulledAt };
  }

  const runId = await beginVendorCreditSyncRun(operatingCompanyId, QBO_VENDOR_CREDITS_MIRROR_SYNC_KIND, {
    direction: "qbo_to_tms",
    mirror_table: "mdata.qbo_vendor_credits",
    source_id_key: "qbo_id",
  });
  let rowsPulled = 0;
  let rowsUpserted = 0;

  try {
    const ctx = await qboCompanyContext(operatingCompanyId);
    const pulledRows: Record<string, unknown>[] = [];
    for await (const page of qboPaginateEntity<Record<string, unknown>>(ctx, "VendorCredit", "", { pageSize: 1000 })) {
      for (const row of page) {
        rowsPulled += 1;
        pulledRows.push(row);
      }
    }

    await withLuciaBypass(async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
      for (const row of pulledRows) {
        await upsertVendorCreditMirror(client, operatingCompanyId, row);
        rowsUpserted += 1;
      }
    });

    await finishVendorCreditSyncRun({
      runId,
      operatingCompanyId,
      success: true,
      recordsProcessed: rowsUpserted,
    });
    return { enabled: true, rowsPulled, rowsUpserted, pulledAt };
  } catch (error) {
    await finishVendorCreditSyncRun({
      runId,
      operatingCompanyId,
      success: false,
      recordsProcessed: rowsUpserted,
      errorMessage: String((error as Error)?.message ?? error),
    }).catch(() => {
      /* audit best-effort */
    });
    throw error;
  }
}

/**
 * ACCT-F4431380 (Lead 443.137 item 9e) — REFUSED BY NAME. This formerly projected mdata.qbo_vendor_credits into accounting.vendor_credits.
 * QuickBooks is a read-only archive: a QBO path writes only its mirror table, never a native money/master
 * table. Throws QboNativeWriteRefusedError (code QBO_NATIVE_WRITE_REFUSED) instead of returning a
 * "0 rows projected" result a caller could mistake for success. The mirror (mdata.qbo_vendor_credits) is kept and still
 * filled by the pull stage; native records are created only through the TMS service layer.
 */
export async function projectVendorCreditsToLedger(operatingCompanyId: string): Promise<VendorCreditsProjectResult> {
  return refuseQboNativeWrite(
    "qbo-sync/qbo-vendor-credits-puller#projectVendorCreditsToLedger",
    ["accounting.vendor_credits"],
    operatingCompanyId
  );
}
