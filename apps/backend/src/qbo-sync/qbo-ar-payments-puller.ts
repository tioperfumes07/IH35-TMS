// QBO-AR-PAYMENTS-PULL — INBOUND QuickBooks A/R receipt (Payment) sync (QBO is system-of-record).
//
// Two flag-gated, idempotent stages so the owner can roll out the QBO->TMS A/R receipt clone safely,
// mirroring the ap-bill-payments-puller / qbo-purchases-puller design:
//
//   Stage 1  pullArPaymentsFromQbo()        gated QBO_AR_PAYMENT_MIRROR_PULL_ENABLED   (default OFF)
//            Clones every QBO Payment (Receive Payment / Deposit against an invoice) into the read-only
//            mirror mdata.qbo_ar_payments (upsert by qbo_id). Non-destructive: a faithful copy of QBO's
//            receipt history the owner can verify ties to QBO BEFORE anything touches the A/R subledger.
//            The full QBO row is kept in payload_json so Stage 2b can project Payment.Line[] without a
//            second network round-trip.
//
//   Stage 2  projectArPaymentsToLedger()    gated QBO_AR_PAYMENTS_PROJECTION_ENABLED  (default OFF)
//            Stage 2  — projects the mirror header into accounting.payments (qbo_payment_id set), upsert
//                       on the EXISTING partial-unique uq_payments_company_qbo_payment_id (no fan-out at
//                       the header — one QBO Payment is one accounting.payments row, unlike BillPayment).
//                       Unresolved customers (no mdata.customers.qbo_customer_id match) are SKIPPED and
//                       counted (customersUnresolved), never invented.
//            Stage 2b — fans each mirror Payment's Line[].LinkedTxn(Invoice) out into accounting.
//                       payment_applications (one row per (payment, invoice) allocation), upsert on the
//                       EXISTING uq_payment_applications_target (payment_id, target_kind, target_id).
//                       Allocations whose Invoice is not (yet) mirrored into accounting.invoices are
//                       SKIPPED and counted (applicationsUnlinked), never invented — the mirror row is
//                       retained so a later invoice sync can resolve them. accounting.payments.
//                       amount_applied_cents / accounting.invoices.amount_paid_cents are kept in sync by
//                       the existing pmt_app_recompute_* triggers (0060) — this puller never writes them
//                       directly.
//
// NO GL/journal posting is performed here — this only populates the A/R subledger; GL stays QuickBooks'
// job. The posting engine additionally REFUSES to post a qbo-sourced customer payment
// (QBO_CUSTOMER_PAYMENT_POST_GL_REFUSED) so the parallel-books invariant (never invent GL for
// source_system=qbo) can't be violated downstream.
//
// Both flags default OFF (financial cluster — HOLD for owner approval). Stage 1 follows the ap-bills /
// G5-2 customers-puller pattern: HTTP pagination OUTSIDE any DB transaction; upsert in a short txn;
// qbo.sync_runs audit rows commit in their OWN transactions so a data-txn failure cannot roll back the
// failed audit. Never invents mirror rows from TMS payments. Never writes TMS→QBO.

import type { PoolClient } from "pg";
import { qboCompanyContext, qboPaginateEntity } from "../integrations/qbo/qbo-client.js";
import { withLuciaBypass } from "../auth/db.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import { QBO_AR_PAYMENTS_MIRROR_SYNC_KIND } from "./qbo-ar-payments-sync-kind.js";
import { recordFlagDisabledMirrorSyncRun } from "./record-flag-disabled-sync-run.js";

// Default-OFF financial flags (financial cluster — HOLD for owner approval). SINGLE SOURCE OF TRUTH is the
// DB feature flag resolved PER-ENTITY via isEnabled() (lib.feature_flag_overrides keyed on
// operating_company_id) — NOT a process.env var. isEnabled() returns false when the flag row/override is
// absent, so an unregistered flag stays SAFE-OFF.
const AR_PAYMENT_MIRROR_PULL_FLAG = "QBO_AR_PAYMENT_MIRROR_PULL_ENABLED";
const AR_PAYMENTS_PROJECTION_FLAG = "QBO_AR_PAYMENTS_PROJECTION_ENABLED";

export { QBO_AR_PAYMENTS_MIRROR_SYNC_KIND };

export type ArPaymentsPullResult = {
  enabled: boolean;
  rowsPulled: number;
  rowsUpserted: number;
  pulledAt: string;
};

export type ArPaymentsProjectResult = {
  enabled: boolean;
  paymentsProjected: number;
  customersUnresolved: number;
  applicationsProjected: number;
  applicationsUnlinked: number;
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

async function upsertArPaymentMirror(client: PoolClient, operatingCompanyId: string, row: Record<string, unknown>): Promise<void> {
  const qboId = String(row.Id ?? "");
  if (!qboId) return;
  const syncToken = row.SyncToken != null ? String(row.SyncToken) : null;
  const docNumber = row.DocNumber != null ? String(row.DocNumber) : null;
  const customer = refValue(row, "CustomerRef");
  const depositTo = refValue(row, "DepositToAccountRef").value;
  const paymentMethod = refValue(row, "PaymentMethodRef");
  const paymentRefNum = row.PaymentRefNum != null ? String(row.PaymentRefNum) : null;
  const currency = refValue(row, "CurrencyRef").value;
  const privateNote = row.PrivateNote != null ? String(row.PrivateNote) : null;
  const totalCents = toCents(row.TotalAmt);
  const unappliedCents = row.UnappliedAmt != null ? toCents(row.UnappliedAmt) : null;
  const active = row.Active === undefined ? true : Boolean(row.Active);
  const updated = metaUpdatedAt(row);

  await client.query(
    `
      INSERT INTO mdata.qbo_ar_payments (
        operating_company_id,
        qbo_id,
        qbo_sync_token,
        doc_number,
        customer_qbo_id,
        customer_name,
        txn_date,
        total_cents,
        unapplied_cents,
        deposit_to_account_qbo_id,
        payment_method_qbo_id,
        payment_method_name,
        payment_ref_num,
        currency,
        private_note,
        active,
        qbo_updated_at,
        mirrored_at,
        last_seen_at,
        payload_json,
        updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,now(),now(),$18::jsonb,now())
      ON CONFLICT (operating_company_id, qbo_id)
      DO UPDATE SET
        qbo_sync_token = EXCLUDED.qbo_sync_token,
        doc_number = EXCLUDED.doc_number,
        customer_qbo_id = EXCLUDED.customer_qbo_id,
        customer_name = EXCLUDED.customer_name,
        txn_date = EXCLUDED.txn_date,
        total_cents = EXCLUDED.total_cents,
        unapplied_cents = EXCLUDED.unapplied_cents,
        deposit_to_account_qbo_id = EXCLUDED.deposit_to_account_qbo_id,
        payment_method_qbo_id = EXCLUDED.payment_method_qbo_id,
        payment_method_name = EXCLUDED.payment_method_name,
        payment_ref_num = EXCLUDED.payment_ref_num,
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
      customer.value,
      customer.name,
      asDate(row.TxnDate),
      totalCents,
      unappliedCents,
      depositTo,
      paymentMethod.value,
      paymentMethod.name,
      paymentRefNum,
      currency,
      privateNote,
      active,
      updated,
      JSON.stringify(row),
    ]
  );
}

/** Durable audit begin — own COMMIT via withLuciaBypass. Survives later data-txn rollback. */
export async function beginArPaymentsMirrorSyncRun(operatingCompanyId: string): Promise<string | null> {
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
        QBO_AR_PAYMENTS_MIRROR_SYNC_KIND,
        JSON.stringify({
          direction: "qbo_to_tms",
          mirror_table: "mdata.qbo_ar_payments",
          source_id_key: "qbo_id",
        }),
      ]
    );
    return res.rows[0]?.id ?? null;
  });
}

/** Durable audit finish — own COMMIT. Must run even when the upsert txn failed (no failed-audit rollback). */
export async function finishArPaymentsMirrorSyncRun(input: {
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
 * Stage 1 — clone QBO Payments into the read-only mirror mdata.qbo_ar_payments. Idempotent (upsert by
 * qbo_id). No-op unless QBO_AR_PAYMENT_MIRROR_PULL_ENABLED is ON for this entity.
 *
 * Transaction boundaries (G5-2):
 *   1) flag check — short txn
 *   2) sync_runs running — short txn (COMMIT)
 *   3) QBO HTTP pagination — NO DB connection held
 *   4) mirror upserts — short txn
 *   5) sync_runs success/failed — short txn (COMMIT even if step 4 failed)
 */
export async function pullArPaymentsFromQbo(operatingCompanyId: string): Promise<ArPaymentsPullResult> {
  const pulledAt = new Date().toISOString();

  const enabled = await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    return isEnabled(client, AR_PAYMENT_MIRROR_PULL_FLAG, { operating_company_id: operatingCompanyId });
  });
  if (!enabled) {
    // Durable audit: OFF must not look like a dead cron (no sync_runs row).
    await recordFlagDisabledMirrorSyncRun({
      operatingCompanyId,
      kind: QBO_AR_PAYMENTS_MIRROR_SYNC_KIND,
      flagKey: AR_PAYMENT_MIRROR_PULL_FLAG,
      mirrorTable: "mdata.qbo_ar_payments",
    });
    return { enabled: false, rowsPulled: 0, rowsUpserted: 0, pulledAt };
  }

  const runId = await beginArPaymentsMirrorSyncRun(operatingCompanyId);
  let rowsPulled = 0;
  let rowsUpserted = 0;

  try {
    const ctx = await qboCompanyContext(operatingCompanyId);
    const pulledRows: Record<string, unknown>[] = [];
    for await (const page of qboPaginateEntity<Record<string, unknown>>(ctx, "Payment", "", { pageSize: 1000 })) {
      for (const row of page) {
        rowsPulled += 1;
        pulledRows.push(row);
      }
    }

    await withLuciaBypass(async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
      for (const row of pulledRows) {
        await upsertArPaymentMirror(client, operatingCompanyId, row);
        rowsUpserted += 1;
      }
    });

    await finishArPaymentsMirrorSyncRun({
      runId,
      operatingCompanyId,
      success: true,
      recordsProcessed: rowsUpserted,
    });
    return { enabled: true, rowsPulled, rowsUpserted, pulledAt };
  } catch (error) {
    await finishArPaymentsMirrorSyncRun({
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

type LinkedInvoiceAllocation = { invoiceQboId: string; amountCents: number };

/** Parse a QBO Payment.Line[] into positive-amount Invoice allocations (sums duplicate lines against the
 *  same invoice so the caller's upsert hits its ON CONFLICT target at most once per invoice). */
export function parsePaymentLinkedInvoices(payload: unknown): LinkedInvoiceAllocation[] {
  const row = (payload ?? {}) as Record<string, unknown>;
  const rawLines = Array.isArray(row.Line) ? (row.Line as Record<string, unknown>[]) : [];
  const byInvoice = new Map<string, number>();
  for (const line of rawLines) {
    const amountCents = toCents(line.Amount);
    if (amountCents <= 0) continue;
    const linkedTxns = Array.isArray(line.LinkedTxn) ? (line.LinkedTxn as Record<string, unknown>[]) : [];
    for (const lt of linkedTxns) {
      if (String(lt.TxnType ?? "") !== "Invoice") continue;
      const invoiceQboId = lt.TxnId != null ? String(lt.TxnId) : null;
      if (!invoiceQboId) continue;
      byInvoice.set(invoiceQboId, (byInvoice.get(invoiceQboId) ?? 0) + amountCents);
    }
  }
  return [...byInvoice.entries()].map(([invoiceQboId, amountCents]) => ({ invoiceQboId, amountCents }));
}

/**
 * Stage 2 + 2b — project the QBO Payment mirror into accounting.payments + payment_applications.
 *
 * ROOT FIX (Sentry IH35-TMS-PROD-25 / idle_in_transaction_session_timeout):
 * Set-based INSERT…SELECT / UPDATE (mirror bill_payments + expenses). The prior per-row await loop
 * (incl. nextPaymentDisplayId + deposit resolver per mirror) held one withLuciaBypass txn open across
 * ~23k payments; Postgres idle_in_transaction timeout killed the connection, rolled the projection
 * to 0 rows, and the uncaught pool error bounced the API worker.
 *
 * Flag check = own short txn; projection = separate short txn (never shared with Stage 1 QBO HTTP).
 * display_id assigned once via year-partitioned row_number + existing MAX (Rule 03) — never rewritten
 * on UPDATE. Unresolved customers/invoices skipped+counted. NO GL. No-op unless
 * QBO_AR_PAYMENTS_PROJECTION_ENABLED ON for this entity.
 */
export async function projectArPaymentsToLedger(operatingCompanyId: string): Promise<ArPaymentsProjectResult> {
  const projectedAt = new Date().toISOString();

  let enabled = false;
  await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    enabled = await isEnabled(client, AR_PAYMENTS_PROJECTION_FLAG, { operating_company_id: operatingCompanyId });
  });
  if (!enabled) {
    return {
      enabled: false,
      paymentsProjected: 0,
      customersUnresolved: 0,
      applicationsProjected: 0,
      applicationsUnlinked: 0,
      projectedAt,
    };
  }

  let paymentsProjected = 0;
  let customersUnresolved = 0;
  let applicationsProjected = 0;
  let applicationsUnlinked = 0;

  await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    // Serialize display_id allocation for this company (same advisory key family as nextPaymentDisplayId).
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `accounting.payment.display_id:${operatingCompanyId}:qbo_project`,
    ]);

    const unresolvedCust = await client.query<{ n: string }>(
      `
        SELECT count(*)::text AS n
        FROM mdata.qbo_ar_payments m
        WHERE m.operating_company_id = $1::uuid
          AND m.active = true
          AND m.total_cents > 0
          AND (
            m.customer_qbo_id IS NULL
            OR NOT EXISTS (
              SELECT 1 FROM mdata.customers c
              WHERE c.operating_company_id = m.operating_company_id
                AND c.qbo_customer_id = m.customer_qbo_id
            )
          )
      `,
      [operatingCompanyId]
    );
    customersUnresolved = Number(unresolvedCust.rows[0]?.n ?? 0);

    // Update already-projected headers (never touch display_id).
    await client.query(
      `
        UPDATE accounting.payments p
        SET
          customer_id = c.id,
          payment_date = COALESCE(m.txn_date, CURRENT_DATE),
          amount_cents = m.total_cents,
          reference = m.payment_ref_num,
          deposited_to_account_id = dep.id,
          payment_method = CASE
            WHEN m.payment_method_name IS NULL OR btrim(m.payment_method_name) = '' THEN 'other'
            WHEN lower(m.payment_method_name) LIKE '%ach%'
              OR lower(m.payment_method_name) LIKE '%e-check%'
              OR lower(m.payment_method_name) LIKE '%echeck%' THEN 'ach'
            WHEN lower(m.payment_method_name) LIKE '%wire%' THEN 'wire'
            WHEN lower(m.payment_method_name) LIKE '%check%' THEN 'check'
            WHEN lower(m.payment_method_name) LIKE '%cash%' THEN 'cash'
            WHEN lower(m.payment_method_name) LIKE '%credit%'
              OR lower(m.payment_method_name) LIKE '%card%' THEN 'credit_card'
            ELSE 'other'
          END,
          notes = m.private_note,
          qbo_sync_token = m.qbo_sync_token,
          source = 'qbo_clone',
          last_qbo_synced_at = now()
        FROM mdata.qbo_ar_payments m
        JOIN mdata.customers c
          ON c.operating_company_id = m.operating_company_id
         AND c.qbo_customer_id = m.customer_qbo_id
        LEFT JOIN catalogs.accounts dep
          ON dep.operating_company_id = m.operating_company_id
         AND dep.qbo_account_id = m.deposit_to_account_qbo_id
         AND dep.deactivated_at IS NULL
         AND dep.is_postable = true
        WHERE p.operating_company_id = $1::uuid
          AND p.qbo_payment_id = m.qbo_id
          AND m.operating_company_id = $1::uuid
          AND m.active = true
          AND m.total_cents > 0
      `,
      [operatingCompanyId]
    );

    // Insert new headers with year-scoped display_ids (PMT-YYYY-NNNNN).
    const inserted = await client.query(
      `
        WITH eligible AS (
          SELECT
            m.operating_company_id,
            m.qbo_id,
            m.qbo_sync_token,
            c.id AS customer_id,
            COALESCE(m.txn_date, CURRENT_DATE) AS payment_date,
            m.total_cents,
            m.payment_ref_num,
            m.private_note,
            dep.id AS deposited_to_account_id,
            CASE
              WHEN m.payment_method_name IS NULL OR btrim(m.payment_method_name) = '' THEN 'other'
              WHEN lower(m.payment_method_name) LIKE '%ach%'
                OR lower(m.payment_method_name) LIKE '%e-check%'
                OR lower(m.payment_method_name) LIKE '%echeck%' THEN 'ach'
              WHEN lower(m.payment_method_name) LIKE '%wire%' THEN 'wire'
              WHEN lower(m.payment_method_name) LIKE '%check%' THEN 'check'
              WHEN lower(m.payment_method_name) LIKE '%cash%' THEN 'cash'
              WHEN lower(m.payment_method_name) LIKE '%credit%'
                OR lower(m.payment_method_name) LIKE '%card%' THEN 'credit_card'
              ELSE 'other'
            END AS payment_method,
            EXTRACT(YEAR FROM COALESCE(m.txn_date, CURRENT_DATE))::int AS yr
          FROM mdata.qbo_ar_payments m
          JOIN mdata.customers c
            ON c.operating_company_id = m.operating_company_id
           AND c.qbo_customer_id = m.customer_qbo_id
          LEFT JOIN catalogs.accounts dep
            ON dep.operating_company_id = m.operating_company_id
           AND dep.qbo_account_id = m.deposit_to_account_qbo_id
           AND dep.deactivated_at IS NULL
           AND dep.is_postable = true
          WHERE m.operating_company_id = $1::uuid
            AND m.active = true
            AND m.total_cents > 0
            AND NOT EXISTS (
              SELECT 1 FROM accounting.payments p
              WHERE p.operating_company_id = m.operating_company_id
                AND p.qbo_payment_id = m.qbo_id
            )
        ),
        year_max AS (
          SELECT
            EXTRACT(YEAR FROM payment_date)::int AS yr,
            COALESCE(
              MAX(
                CASE
                  WHEN display_id ~ '^PMT-[0-9]{4}-[0-9]{5}$' THEN right(display_id, 5)::int
                  ELSE 0
                END
              ),
              0
            ) AS max_n
          FROM accounting.payments
          WHERE operating_company_id = $1::uuid
          GROUP BY 1
        ),
        numbered AS (
          SELECT
            e.*,
            row_number() OVER (PARTITION BY e.yr ORDER BY e.payment_date, e.qbo_id) AS rn
          FROM eligible e
        )
        INSERT INTO accounting.payments (
          operating_company_id,
          customer_id,
          display_id,
          payment_method,
          payment_date,
          reference,
          amount_cents,
          deposited_to_account_id,
          notes,
          payment_source_kind,
          qbo_payment_id,
          qbo_sync_token,
          source_system,
          source,
          last_qbo_synced_at
        )
        SELECT
          n.operating_company_id,
          n.customer_id,
          'PMT-' || n.yr::text || '-' || lpad((COALESCE(ym.max_n, 0) + n.rn)::text, 5, '0'),
          n.payment_method,
          n.payment_date,
          n.payment_ref_num,
          n.total_cents,
          n.deposited_to_account_id,
          n.private_note,
          'qbo_sync',
          n.qbo_id,
          n.qbo_sync_token,
          'qbo',
          'qbo_clone',
          now()
        FROM numbered n
        LEFT JOIN year_max ym ON ym.yr = n.yr
        ON CONFLICT (operating_company_id, qbo_payment_id) WHERE qbo_payment_id IS NOT NULL
        DO UPDATE SET
          customer_id = EXCLUDED.customer_id,
          payment_date = EXCLUDED.payment_date,
          amount_cents = EXCLUDED.amount_cents,
          reference = EXCLUDED.reference,
          deposited_to_account_id = EXCLUDED.deposited_to_account_id,
          payment_method = EXCLUDED.payment_method,
          notes = EXCLUDED.notes,
          qbo_sync_token = EXCLUDED.qbo_sync_token,
          last_qbo_synced_at = now()
      `,
      [operatingCompanyId]
    );
    paymentsProjected = inserted.rowCount ?? 0;

    // Count all active projected headers for observability (inserts + already present after update).
    const projectedCount = await client.query<{ n: string }>(
      `
        SELECT count(*)::text AS n
        FROM accounting.payments p
        JOIN mdata.qbo_ar_payments m
          ON m.operating_company_id = p.operating_company_id
         AND m.qbo_id = p.qbo_payment_id
        WHERE p.operating_company_id = $1::uuid
          AND m.active = true
          AND m.total_cents > 0
      `,
      [operatingCompanyId]
    );
    paymentsProjected = Number(projectedCount.rows[0]?.n ?? paymentsProjected);

    const apps = await client.query(
      `
        WITH exploded AS (
          SELECT
            m.operating_company_id,
            m.qbo_id AS qbo_payment_id,
            (lt->>'TxnId') AS linked_invoice_qbo_id,
            (lt->>'TxnType') AS linked_txn_type,
            ROUND(COALESCE((line->>'Amount')::numeric, 0) * 100)::bigint AS line_amount_cents
          FROM mdata.qbo_ar_payments m
          CROSS JOIN LATERAL jsonb_array_elements(COALESCE(m.payload_json->'Line', '[]'::jsonb)) AS line
          CROSS JOIN LATERAL jsonb_array_elements(COALESCE(line->'LinkedTxn', '[]'::jsonb)) AS lt
          WHERE m.operating_company_id = $1::uuid
            AND m.active = true
            AND m.total_cents > 0
        ),
        agg AS (
          SELECT
            operating_company_id,
            qbo_payment_id,
            linked_invoice_qbo_id,
            SUM(line_amount_cents)::bigint AS amount_cents
          FROM exploded
          WHERE linked_txn_type = 'Invoice'
            AND linked_invoice_qbo_id IS NOT NULL
            AND line_amount_cents > 0
          GROUP BY operating_company_id, qbo_payment_id, linked_invoice_qbo_id
        )
        INSERT INTO accounting.payment_applications (
          operating_company_id,
          payment_id,
          invoice_id,
          target_kind,
          target_id,
          amount_cents,
          amount_applied
        )
        SELECT
          a.operating_company_id,
          p.id,
          i.id,
          'invoice',
          i.id,
          a.amount_cents,
          (a.amount_cents / 100.0)
        FROM agg a
        JOIN accounting.payments p
          ON p.operating_company_id = a.operating_company_id
         AND p.qbo_payment_id = a.qbo_payment_id
        JOIN accounting.invoices i
          ON i.operating_company_id = a.operating_company_id
         AND i.qbo_invoice_id = a.linked_invoice_qbo_id
        ON CONFLICT (payment_id, target_kind, target_id)
        DO UPDATE SET
          invoice_id = EXCLUDED.invoice_id,
          amount_cents = EXCLUDED.amount_cents,
          amount_applied = EXCLUDED.amount_applied
      `,
      [operatingCompanyId]
    );
    applicationsProjected = apps.rowCount ?? 0;

    const unlinked = await client.query<{ n: string }>(
      `
        WITH exploded AS (
          SELECT
            m.operating_company_id,
            (lt->>'TxnId') AS linked_invoice_qbo_id,
            (lt->>'TxnType') AS linked_txn_type,
            ROUND(COALESCE((line->>'Amount')::numeric, 0) * 100)::bigint AS line_amount_cents
          FROM mdata.qbo_ar_payments m
          CROSS JOIN LATERAL jsonb_array_elements(COALESCE(m.payload_json->'Line', '[]'::jsonb)) AS line
          CROSS JOIN LATERAL jsonb_array_elements(COALESCE(line->'LinkedTxn', '[]'::jsonb)) AS lt
          WHERE m.operating_company_id = $1::uuid
            AND m.active = true
            AND m.total_cents > 0
        )
        SELECT count(*)::text AS n
        FROM exploded e
        WHERE e.linked_txn_type = 'Invoice'
          AND e.linked_invoice_qbo_id IS NOT NULL
          AND e.line_amount_cents > 0
          AND NOT EXISTS (
            SELECT 1 FROM accounting.invoices i
            WHERE i.operating_company_id = e.operating_company_id
              AND i.qbo_invoice_id = e.linked_invoice_qbo_id
          )
      `,
      [operatingCompanyId]
    );
    applicationsUnlinked = Number(unlinked.rows[0]?.n ?? 0);
  });

  return {
    enabled: true,
    paymentsProjected,
    customersUnresolved,
    applicationsProjected,
    applicationsUnlinked,
    projectedAt,
  };
}
