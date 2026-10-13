// ACCT-F4431380 (Lead 443.137 item 9e, owner ruling: QuickBooks is a READ-ONLY ARCHIVE): the Stage 2
// projection described below is REMOVED. Its entry point now throws QboNativeWriteRefusedError
// (QBO_NATIVE_WRITE_REFUSED); this file writes ONLY its mirror (mdata.qbo_*) and qbo.sync_runs.
// Guard: scripts/verify-qbo-paths-never-write-native-tables.mjs. The Stage 2 text is kept as history.
//
// ACCT-PAYAPPS — INBOUND QuickBooks Invoice sync (QBO is system-of-record).
//
// WHY: payment_applications Stage 2b joins accounting.invoices.qbo_invoice_id. Neon lucia TRANSP
// 2026-07-29: payments=12123, payment_applications=0, ~12206 Payment→Invoice LinkedTxn links in
// mdata.qbo_ar_payments.payload_json, but accounting.invoices.qbo_invoice_id density=0 and
// mdata.qbo_invoices is OUTBOUND-only (invoice_id NOT NULL). This inbound mirror unblocks Stage 2b.
//
//   Stage 1  pullArInvoicesFromQbo()        gated QBO_AR_INVOICE_MIRROR_PULL_ENABLED   (default OFF)
//   Stage 2  projectArInvoicesToLedger()    gated QBO_AR_INVOICES_PROJECTION_ENABLED  (default OFF)
//
// SUBLEDGER ONLY — NO GL. Unresolved customers SKIPPED. display_id INV-YYYY-NNNNN for new rows only.
// amount_open_cents is GENERATED — never inserted.

import type { PoolClient } from "pg";
import { qboCompanyContext, qboPaginateEntity } from "../integrations/qbo/qbo-client.js";
import { withLuciaBypass } from "../auth/db.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import {
  QBO_AR_INVOICES_MIRROR_SYNC_KIND,
  QBO_AR_INVOICES_PROJECTION_SYNC_KIND,
} from "./qbo-ar-invoices-sync-kind.js";
import { recordFlagDisabledMirrorSyncRun } from "./record-flag-disabled-sync-run.js";
import { refuseQboNativeWrite } from "./qbo-native-write-refused.js";

const MIRROR_PULL_FLAG = "QBO_AR_INVOICE_MIRROR_PULL_ENABLED";

export { QBO_AR_INVOICES_MIRROR_SYNC_KIND, QBO_AR_INVOICES_PROJECTION_SYNC_KIND };

export type ArInvoicesPullResult = {
  enabled: boolean;
  rowsPulled: number;
  rowsUpserted: number;
  pulledAt: string;
};

export type ArInvoicesProjectResult = {
  enabled: boolean;
  invoicesProjected: number;
  /** ACCT-F154: invoice_lines written this run. Was structurally always 0 before — the AR importer
   *  projected headers only, so a re-clone recreated header-only invoices and undid ACCT-F146. */
  linesProjected: number;
  /** ACCT-F154: invoices whose projected lines do NOT reconstruct subtotal_cents. Surfaced rather
   *  than thrown — headers are already committed when lines are written, so failing the run would
   *  neither unwrite them nor fix the drift. Non-zero is a real reconciliation break. */
  lineTieOutFailures: number;
  customersUnresolved: number;
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

async function upsertArInvoiceMirror(
  client: PoolClient,
  operatingCompanyId: string,
  row: Record<string, unknown>
): Promise<void> {
  const qboId = String(row.Id ?? "");
  if (!qboId) return;
  const syncToken = row.SyncToken != null ? String(row.SyncToken) : null;
  const docNumber = row.DocNumber != null ? String(row.DocNumber) : null;
  const customer = refValue(row, "CustomerRef");
  const currency = refValue(row, "CurrencyRef").value;
  const privateNote = row.PrivateNote != null ? String(row.PrivateNote) : null;
  const totalCents = toCents(row.TotalAmt);
  const balanceCents = toCents(row.Balance);
  const updated = metaUpdatedAt(row);

  await client.query(
    `
      INSERT INTO mdata.qbo_ar_invoices (
        operating_company_id,
        qbo_id,
        qbo_sync_token,
        doc_number,
        customer_qbo_id,
        customer_name,
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
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,$13,now(),now(),$14::jsonb,now())
      ON CONFLICT (operating_company_id, qbo_id)
      DO UPDATE SET
        qbo_sync_token = EXCLUDED.qbo_sync_token,
        doc_number = EXCLUDED.doc_number,
        customer_qbo_id = EXCLUDED.customer_qbo_id,
        customer_name = EXCLUDED.customer_name,
        txn_date = EXCLUDED.txn_date,
        due_date = EXCLUDED.due_date,
        total_cents = EXCLUDED.total_cents,
        balance_cents = EXCLUDED.balance_cents,
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
      customer.value,
      customer.name,
      asDate(row.TxnDate),
      asDate(row.DueDate),
      totalCents,
      balanceCents,
      currency,
      privateNote,
      updated,
      JSON.stringify(row),
    ]
  );
}

async function beginArInvoiceSyncRun(
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

async function finishArInvoiceSyncRun(input: {
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

export async function pullArInvoicesFromQbo(operatingCompanyId: string): Promise<ArInvoicesPullResult> {
  const pulledAt = new Date().toISOString();

  const enabled = await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    return isEnabled(client, MIRROR_PULL_FLAG, { operating_company_id: operatingCompanyId });
  });
  if (!enabled) {
    await recordFlagDisabledMirrorSyncRun({
      operatingCompanyId,
      kind: QBO_AR_INVOICES_MIRROR_SYNC_KIND,
      flagKey: MIRROR_PULL_FLAG,
      mirrorTable: "mdata.qbo_ar_invoices",
    });
    return { enabled: false, rowsPulled: 0, rowsUpserted: 0, pulledAt };
  }

  const runId = await beginArInvoiceSyncRun(operatingCompanyId, QBO_AR_INVOICES_MIRROR_SYNC_KIND, {
    direction: "qbo_to_tms",
    mirror_table: "mdata.qbo_ar_invoices",
    source_id_key: "qbo_id",
  });
  let rowsPulled = 0;
  let rowsUpserted = 0;

  try {
    const ctx = await qboCompanyContext(operatingCompanyId);
    const pulledRows: Record<string, unknown>[] = [];
    for await (const page of qboPaginateEntity<Record<string, unknown>>(ctx, "Invoice", "", { pageSize: 1000 })) {
      for (const row of page) {
        rowsPulled += 1;
        pulledRows.push(row);
      }
    }

    await withLuciaBypass(async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
      for (const row of pulledRows) {
        await upsertArInvoiceMirror(client, operatingCompanyId, row);
        rowsUpserted += 1;
      }
    });

    await finishArInvoiceSyncRun({
      runId,
      operatingCompanyId,
      success: true,
      recordsProcessed: rowsUpserted,
    });
    return { enabled: true, rowsPulled, rowsUpserted, pulledAt };
  } catch (error) {
    await finishArInvoiceSyncRun({
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
 * ACCT-F4431380 (Lead 443.137 item 9e) — REFUSED BY NAME. This formerly projected mdata.qbo_ar_invoices into accounting.invoices + accounting.invoice_lines.
 * QuickBooks is a read-only archive: a QBO path writes only its mirror table, never a native money/master
 * table. Throws QboNativeWriteRefusedError (code QBO_NATIVE_WRITE_REFUSED) instead of returning a
 * "0 rows projected" result a caller could mistake for success. The mirror (mdata.qbo_ar_invoices) is kept and still
 * filled by the pull stage; native records are created only through the TMS service layer.
 */
export async function projectArInvoicesToLedger(operatingCompanyId: string): Promise<ArInvoicesProjectResult> {
  return refuseQboNativeWrite(
    "qbo-sync/qbo-ar-invoices-puller#projectArInvoicesToLedger",
    ["accounting.invoices", "accounting.invoice_lines"],
    operatingCompanyId
  );
}
