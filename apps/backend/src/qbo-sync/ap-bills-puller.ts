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
// Both flags default OFF (financial cluster — HOLD for owner approval). Reuses the existing puller
// pattern (qboCompanyContext + qboPaginateEntity + withLuciaBypass), inventing no new sync framework.

import type { PoolClient } from "pg";
import { qboCompanyContext, qboPaginateEntity } from "../integrations/qbo/qbo-client.js";
import { withLuciaBypass } from "../auth/db.js";

// Default-OFF financial flags (same convention as BILL_GL_POSTING_ENABLED). A flag is ON only when
// the env var is exactly "true"; anything else (unset/empty/"false") keeps the stage disabled.
const AP_MIRROR_PULL_ENABLED =
  process.env.QBO_AP_MIRROR_PULL_ENABLED === "true";
const AP_BILLS_PROJECTION_ENABLED =
  process.env.QBO_AP_BILLS_PROJECTION_ENABLED === "true";

export type ApBillsPullResult = {
  enabled: boolean;
  rowsPulled: number;
  rowsUpserted: number;
  pulledAt: string;
};

export type ApBillsProjectResult = {
  enabled: boolean;
  rowsProjected: number;
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

/**
 * Stage 1 — clone QBO Bills into the read-only mirror mdata.qbo_ap_bills. Idempotent (upsert by
 * qbo_id) so a one-time backfill and the recurring tick both converge. No-op unless
 * QBO_AP_MIRROR_PULL_ENABLED=true.
 */
export async function pullApBillsFromQbo(operatingCompanyId: string): Promise<ApBillsPullResult> {
  const pulledAt = new Date().toISOString();
  if (!AP_MIRROR_PULL_ENABLED) {
    return { enabled: false, rowsPulled: 0, rowsUpserted: 0, pulledAt };
  }

  let rowsPulled = 0;
  let rowsUpserted = 0;

  await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const ctx = await qboCompanyContext(operatingCompanyId);
    for await (const page of qboPaginateEntity<Record<string, unknown>>(ctx, "Bill", "", { pageSize: 1000 })) {
      for (const row of page) {
        rowsPulled += 1;
        await upsertApBillMirror(client, operatingCompanyId, row);
        rowsUpserted += 1;
      }
    }
  });

  return { enabled: true, rowsPulled, rowsUpserted, pulledAt };
}

/**
 * Stage 2 — project the QBO A/P mirror into accounting.bills (source_system='qbo'). Set-based,
 * idempotent upsert on the existing uq_bills_company_qbo_bill_id key. Vendor linkage resolves
 * mdata.vendors via qbo_vendor_id so the aging view can render names. Bills with no positive total
 * are skipped (accounting.bills enforces amount_cents > 0). No-op unless
 * QBO_AP_BILLS_PROJECTION_ENABLED=true.
 */
export async function projectApBillsToLedger(operatingCompanyId: string): Promise<ApBillsProjectResult> {
  const projectedAt = new Date().toISOString();
  if (!AP_BILLS_PROJECTION_ENABLED) {
    return { enabled: false, rowsProjected: 0, projectedAt };
  }

  let rowsProjected = 0;

  await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
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

  return { enabled: true, rowsProjected, projectedAt };
}
