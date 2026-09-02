// C6-MONEY-JE-EXEMPT: this file's own header (below) already states it — "NO GL/journal posting is
// performed here... GL stays QBO's job." QBO is the system-of-record for these rows; the TMS side
// is a read-only mirror/subledger projection, never a live TMS money event needing its own JE.
//
// QBO-AP-BILLPAY-PULL — INBOUND QuickBooks A/P payment (BillPayment) sync (QBO is system-of-record).
//
// Two flag-gated, idempotent stages so the owner can roll out the QBO->TMS A/P PAYMENT clone safely,
// mirroring the ap-bills-puller design exactly:
//
//   Stage 1  pullApBillPaymentsFromQbo()      gated QBO_AP_BILL_PAYMENT_MIRROR_PULL_ENABLED  (default OFF)
//            Clones every QBO BillPayment into the read-only mirror mdata.qbo_ap_bill_payments
//            (upsert by qbo_id). Non-destructive: a faithful copy of QBO's payment history the owner
//            can verify ties to QBO BEFORE anything touches the accounting subledger.
//
//   Stage 2  projectApBillPaymentsToLedger()  gated QBO_AP_BILL_PAYMENTS_PROJECTION_ENABLED  (default OFF)
//            FANS OUT each mirror BillPayment's Line[].LinkedTxn(Bill) into accounting.bill_payments
//            (source_system='qbo'), ONE row per (payment, bill) allocation, matched to accounting.bills
//            by qbo_bill_id. Upsert on uq_bill_payments_company_qbo_bp_bill
//            (operating_company_id, qbo_bill_payment_id, bill_id). void-not-delete: rows are only ever
//            upserted, never deleted. NO GL/journal posting is performed here — this only populates the
//            A/P subledger; GL stays QBO's job. LinkedTxn whose Bill is not (yet) mirrored into
//            accounting.bills are SKIPPED and left in the mirror (paymentsUnlinked metric), never
//            invented. from_bank_account_id is left NULL — a later reconcile pass wires bank linkage.
//
// Both flags default OFF (financial cluster — HOLD for owner approval). Stage 1 follows the ap-bills /
// G5-2 customers-puller pattern: HTTP pagination OUTSIDE any DB transaction; upsert in a short txn;
// qbo.sync_runs audit rows commit in their OWN transactions so a data-txn failure cannot roll back the
// failed audit. Never invents mirror rows from TMS payments. Never writes TMS→QBO.

import type { PoolClient } from "pg";
import { qboCompanyContext, qboPaginateEntity } from "../integrations/qbo/qbo-client.js";
import { withLuciaBypass } from "../auth/db.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import { AP_BILL_PAYMENTS_MIRROR_SYNC_KIND } from "./ap-bill-payments-sync-kind.js";
import { recordFlagDisabledMirrorSyncRun } from "./record-flag-disabled-sync-run.js";

// Default-OFF financial flags. SINGLE SOURCE OF TRUTH is the DB feature flag resolved PER-ENTITY via
// isEnabled() (lib.feature_flag_overrides keyed on operating_company_id) — NOT a process.env var.
// isEnabled() returns false when the flag row/override is absent, so an unregistered flag stays SAFE-OFF.
const AP_BILL_PAYMENT_MIRROR_PULL_FLAG = "QBO_AP_BILL_PAYMENT_MIRROR_PULL_ENABLED";
const AP_BILL_PAYMENTS_PROJECTION_FLAG = "QBO_AP_BILL_PAYMENTS_PROJECTION_ENABLED";

export { AP_BILL_PAYMENTS_MIRROR_SYNC_KIND };

export type ApBillPaymentsPullResult = {
  enabled: boolean;
  rowsPulled: number;
  rowsUpserted: number;
  pulledAt: string;
};

export type ApBillPaymentsProjectResult = {
  enabled: boolean;
  rowsProjected: number;
  paymentsUnlinked: number;
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

/** QBO BillPayment carries the funding account inside CheckPayment.BankAccountRef or CreditCardPayment.CCAccountRef. */
function bankAccountRef(row: Record<string, unknown>): string | null {
  const check = row.CheckPayment as Record<string, unknown> | undefined;
  const ref = check?.BankAccountRef as Record<string, unknown> | undefined;
  return ref?.value != null ? String(ref.value) : null;
}
function ccAccountRef(row: Record<string, unknown>): string | null {
  const cc = row.CreditCardPayment as Record<string, unknown> | undefined;
  const ref = cc?.CCAccountRef as Record<string, unknown> | undefined;
  return ref?.value != null ? String(ref.value) : null;
}

async function upsertApBillPaymentMirror(
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
  const payType = row.PayType != null ? String(row.PayType) : null;
  const active = row.Active === undefined ? true : Boolean(row.Active);
  const updated = metaUpdatedAt(row);

  await client.query(
    `
      INSERT INTO mdata.qbo_ap_bill_payments (
        operating_company_id,
        qbo_id,
        qbo_sync_token,
        doc_number,
        vendor_qbo_id,
        vendor_name,
        txn_date,
        total_cents,
        pay_type,
        bank_account_qbo_id,
        cc_account_qbo_id,
        currency,
        private_note,
        active,
        qbo_updated_at,
        mirrored_at,
        last_seen_at,
        payload_json,
        updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now(),now(),$16::jsonb,now())
      ON CONFLICT (operating_company_id, qbo_id)
      DO UPDATE SET
        qbo_sync_token = EXCLUDED.qbo_sync_token,
        doc_number = EXCLUDED.doc_number,
        vendor_qbo_id = EXCLUDED.vendor_qbo_id,
        vendor_name = EXCLUDED.vendor_name,
        txn_date = EXCLUDED.txn_date,
        total_cents = EXCLUDED.total_cents,
        pay_type = EXCLUDED.pay_type,
        bank_account_qbo_id = EXCLUDED.bank_account_qbo_id,
        cc_account_qbo_id = EXCLUDED.cc_account_qbo_id,
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
      totalCents,
      payType,
      bankAccountRef(row),
      ccAccountRef(row),
      currency,
      privateNote,
      active,
      updated,
      JSON.stringify(row),
    ]
  );
}

/** Durable audit begin — own COMMIT via withLuciaBypass. Survives later data-txn rollback. */
export async function beginApBillPaymentsMirrorSyncRun(operatingCompanyId: string): Promise<string | null> {
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
      [
        operatingCompanyId,
        AP_BILL_PAYMENTS_MIRROR_SYNC_KIND,
        JSON.stringify({
          direction: "qbo_to_tms",
          mirror_table: "mdata.qbo_ap_bill_payments",
          source_id_key: "qbo_id",
        }),
      ]
    );
    return res.rows[0]?.id ?? null;
  });
}

/** Durable audit finish — own COMMIT. Must run even when the upsert txn failed (no failed-audit rollback). */
export async function finishApBillPaymentsMirrorSyncRun(input: {
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
 * Stage 1 — clone QBO BillPayments into the read-only mirror mdata.qbo_ap_bill_payments. Idempotent
 * (upsert by qbo_id). No-op unless QBO_AP_BILL_PAYMENT_MIRROR_PULL_ENABLED is ON for this entity.
 *
 * Transaction boundaries (G5-2):
 *   1) flag check — short txn
 *   2) sync_runs running — short txn (COMMIT)
 *   3) QBO HTTP pagination — NO DB connection held
 *   4) mirror upserts — short txn
 *   5) sync_runs success/failed — short txn (COMMIT even if step 4 failed)
 */
export async function pullApBillPaymentsFromQbo(operatingCompanyId: string): Promise<ApBillPaymentsPullResult> {
  const pulledAt = new Date().toISOString();

  const enabled = await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    return isEnabled(client, AP_BILL_PAYMENT_MIRROR_PULL_FLAG, { operating_company_id: operatingCompanyId });
  });
  if (!enabled) {
    // Durable audit: OFF must not look like a dead cron (no sync_runs row).
    await recordFlagDisabledMirrorSyncRun({
      operatingCompanyId,
      kind: AP_BILL_PAYMENTS_MIRROR_SYNC_KIND,
      flagKey: AP_BILL_PAYMENT_MIRROR_PULL_FLAG,
      mirrorTable: "mdata.qbo_ap_bill_payments",
    });
    return { enabled: false, rowsPulled: 0, rowsUpserted: 0, pulledAt };
  }

  const runId = await beginApBillPaymentsMirrorSyncRun(operatingCompanyId);
  let rowsPulled = 0;
  let rowsUpserted = 0;

  try {
    const ctx = await qboCompanyContext(operatingCompanyId);
    const pulledRows: Record<string, unknown>[] = [];
    for await (const page of qboPaginateEntity<Record<string, unknown>>(ctx, "BillPayment", "", { pageSize: 1000 })) {
      for (const row of page) {
        rowsPulled += 1;
        pulledRows.push(row);
      }
    }

    await withLuciaBypass(async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
      for (const row of pulledRows) {
        await upsertApBillPaymentMirror(client, operatingCompanyId, row);
        rowsUpserted += 1;
      }
    });

    await finishApBillPaymentsMirrorSyncRun({
      runId,
      operatingCompanyId,
      success: true,
      recordsProcessed: rowsUpserted,
    });
    return { enabled: true, rowsPulled, rowsUpserted, pulledAt };
  } catch (error) {
    await finishApBillPaymentsMirrorSyncRun({
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
 * Stage 2 — fan the QBO A/P payment mirror out into accounting.bill_payments (source_system='qbo').
 * Set-based, idempotent upsert on uq_bill_payments_company_qbo_bp_bill
 * (operating_company_id, qbo_bill_payment_id, bill_id). Each mirror BillPayment's Line[].LinkedTxn(Bill)
 * becomes one allocation row; multiple lines to the SAME bill inside one payment are summed so the
 * ON CONFLICT target is hit at most once per statement. Allocations whose Bill is not present in
 * accounting.bills (qbo_bill_id match) are SKIPPED and counted (paymentsUnlinked) — never invented, and
 * the mirror row is retained so a later bills pull can resolve them. NO GL posting. Non-positive
 * allocations are skipped (accounting.bill_payments enforces amount_cents > 0). PayType maps to
 * payment_method; from_bank_account_id is intentionally left NULL for now. No-op unless
 * QBO_AP_BILL_PAYMENTS_PROJECTION_ENABLED is ON for this entity.
 */
export async function projectApBillPaymentsToLedger(operatingCompanyId: string): Promise<ApBillPaymentsProjectResult> {
  const projectedAt = new Date().toISOString();

  let enabled = false;
  let rowsProjected = 0;
  let paymentsUnlinked = 0;

  await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    enabled = await isEnabled(client, AP_BILL_PAYMENTS_PROJECTION_FLAG, {
      operating_company_id: operatingCompanyId,
    });
    if (!enabled) return;

    // Explode payload -> one (payment, bill) allocation per LinkedTxn(Bill); sum duplicate lines that
    // reference the same bill inside one payment so ON CONFLICT fires at most once per key per statement.
    const projectRes = await client.query(
      `
        WITH exploded AS (
          SELECT
            m.operating_company_id,
            m.qbo_id                                    AS qbo_bill_payment_id,
            m.qbo_sync_token,
            m.vendor_qbo_id,
            COALESCE(m.txn_date, CURRENT_DATE)          AS payment_date,
            m.pay_type,
            m.private_note,
            (lt->>'TxnId')                              AS linked_bill_qbo_id,
            (lt->>'TxnType')                            AS linked_txn_type,
            ROUND(COALESCE((line->>'Amount')::numeric, 0) * 100)::bigint AS line_amount_cents
          FROM mdata.qbo_ap_bill_payments m
          CROSS JOIN LATERAL jsonb_array_elements(COALESCE(m.payload_json->'Line', '[]'::jsonb)) AS line
          CROSS JOIN LATERAL jsonb_array_elements(COALESCE(line->'LinkedTxn', '[]'::jsonb)) AS lt
          WHERE m.operating_company_id = $1::uuid
        ),
        agg AS (
          SELECT
            operating_company_id,
            qbo_bill_payment_id,
            MAX(qbo_sync_token)  AS qbo_sync_token,
            MAX(vendor_qbo_id)   AS vendor_qbo_id,
            MAX(payment_date)    AS payment_date,
            MAX(pay_type)        AS pay_type,
            MAX(private_note)    AS private_note,
            linked_bill_qbo_id,
            SUM(line_amount_cents)::bigint AS amount_cents
          FROM exploded
          WHERE linked_txn_type = 'Bill'
            AND linked_bill_qbo_id IS NOT NULL
            AND line_amount_cents > 0
          GROUP BY operating_company_id, qbo_bill_payment_id, linked_bill_qbo_id
        )
        INSERT INTO accounting.bill_payments (
          operating_company_id,
          bill_id,
          vendor_id,
          payment_date,
          amount_cents,
          amount,
          payment_method,
          memo,
          qbo_bill_payment_id,
          qbo_sync_token,
          source_system,
          status,
          last_qbo_synced_at,
          created_at,
          updated_at
        )
        SELECT
          a.operating_company_id,
          b.id,
          a.vendor_qbo_id,
          a.payment_date,
          a.amount_cents,
          (a.amount_cents / 100.0),
          CASE a.pay_type
            WHEN 'Check'      THEN 'check'
            WHEN 'CreditCard' THEN 'credit_card'
            WHEN 'Cash'       THEN 'cash'
            ELSE 'check'
          END,
          a.private_note,
          a.qbo_bill_payment_id,
          a.qbo_sync_token,
          'qbo',
          'posted',
          now(),
          now(),
          now()
        FROM agg a
        JOIN accounting.bills b
          ON b.operating_company_id = a.operating_company_id
         AND b.qbo_bill_id = a.linked_bill_qbo_id
        ON CONFLICT (operating_company_id, qbo_bill_payment_id, bill_id) WHERE qbo_bill_payment_id IS NOT NULL
        DO UPDATE SET
          vendor_id = EXCLUDED.vendor_id,
          payment_date = EXCLUDED.payment_date,
          amount_cents = EXCLUDED.amount_cents,
          amount = EXCLUDED.amount,
          payment_method = EXCLUDED.payment_method,
          memo = EXCLUDED.memo,
          qbo_sync_token = EXCLUDED.qbo_sync_token,
          last_qbo_synced_at = now(),
          updated_at = now()
        WHERE accounting.bill_payments.source_system = 'qbo'
      `,
      [operatingCompanyId]
    );
    rowsProjected = projectRes.rowCount ?? 0;

    // Unlinked metric: Bill allocations whose bill is not (yet) in accounting.bills — kept in the mirror,
    // never invented. Read-only count for observability.
    const unlinkedRes = await client.query<{ n: string }>(
      `
        WITH exploded AS (
          SELECT
            m.operating_company_id,
            (lt->>'TxnId')   AS linked_bill_qbo_id,
            (lt->>'TxnType') AS linked_txn_type,
            ROUND(COALESCE((line->>'Amount')::numeric, 0) * 100)::bigint AS line_amount_cents
          FROM mdata.qbo_ap_bill_payments m
          CROSS JOIN LATERAL jsonb_array_elements(COALESCE(m.payload_json->'Line', '[]'::jsonb)) AS line
          CROSS JOIN LATERAL jsonb_array_elements(COALESCE(line->'LinkedTxn', '[]'::jsonb)) AS lt
          WHERE m.operating_company_id = $1::uuid
        )
        SELECT count(*)::text AS n
        FROM exploded e
        WHERE e.linked_txn_type = 'Bill'
          AND e.linked_bill_qbo_id IS NOT NULL
          AND e.line_amount_cents > 0
          AND NOT EXISTS (
            SELECT 1 FROM accounting.bills b
            WHERE b.operating_company_id = e.operating_company_id
              AND b.qbo_bill_id = e.linked_bill_qbo_id
          )
      `,
      [operatingCompanyId]
    );
    paymentsUnlinked = Number(unlinkedRes.rows[0]?.n ?? 0);
  });

  return { enabled, rowsProjected, paymentsUnlinked, projectedAt };
}
