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
import { nextPaymentDisplayId } from "../accounting/display-id.js";
import { resolveCustomerPaymentDepositAccount } from "../accounting/posting-engine.service.js";
import { QBO_AR_PAYMENTS_MIRROR_SYNC_KIND } from "./qbo-ar-payments-sync-kind.js";

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

/** Map a QBO PaymentMethodRef.name (free-text QBO catalog entry) onto the payments.payment_method CHECK
 *  enum ('ach'|'wire'|'check'|'cash'|'factoring_advance'|'factoring_reserve'|'credit_card'|'other'). QBO
 *  Payment (unlike BillPayment) has no fixed PayType, only a name lookup — never invent a value outside
 *  the CHECK; default 'other' when unrecognized. */
function mapPaymentMethod(name: string | null): string {
  const n = (name ?? "").toLowerCase();
  if (!n) return "other";
  if (n.includes("ach") || n.includes("e-check") || n.includes("echeck")) return "ach";
  if (n.includes("wire")) return "wire";
  if (n.includes("check")) return "check";
  if (n.includes("cash")) return "cash";
  if (n.includes("credit") || n.includes("card")) return "credit_card";
  return "other";
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
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
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
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [input.operatingCompanyId]);
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
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    return isEnabled(client, AR_PAYMENT_MIRROR_PULL_FLAG, { operating_company_id: operatingCompanyId });
  });
  if (!enabled) {
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
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
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
 * Stage 2 + 2b — project the QBO Payment mirror into accounting.payments (header, ON CONFLICT on the
 * EXISTING uq_payments_company_qbo_payment_id — one row per QBO Payment, no header fan-out) +
 * accounting.payment_applications (one row per (payment, invoice) allocation, ON CONFLICT on the
 * EXISTING uq_payment_applications_target). display_id is server-generated via nextPaymentDisplayId
 * (Rule 03) on first projection only — never regenerated on re-run. Unresolved customers (no
 * mdata.customers.qbo_customer_id match) and unresolved invoice allocations (no accounting.invoices.
 * qbo_invoice_id match) are SKIPPED and counted, never invented; the mirror/partial state is retained for
 * a later pass to resolve. accounting.payments.amount_applied_cents / accounting.invoices.
 * amount_paid_cents are maintained by the existing pmt_app_recompute_* triggers (0060) — never written
 * directly here. NO GL posting (source_system='qbo'; the posting engine refuses to post it). No-op unless
 * QBO_AR_PAYMENTS_PROJECTION_ENABLED is ON for this entity.
 */
export async function projectArPaymentsToLedger(operatingCompanyId: string): Promise<ArPaymentsProjectResult> {
  const projectedAt = new Date().toISOString();

  let enabled = false;
  let paymentsProjected = 0;
  let customersUnresolved = 0;
  let applicationsProjected = 0;
  let applicationsUnlinked = 0;

  await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    enabled = await isEnabled(client, AR_PAYMENTS_PROJECTION_FLAG, { operating_company_id: operatingCompanyId });
    if (!enabled) return;

    const mirror = await client.query<{
      qbo_id: string;
      qbo_sync_token: string | null;
      customer_qbo_id: string | null;
      txn_date: string | null;
      total_cents: string | number;
      deposit_to_account_qbo_id: string | null;
      payment_method_name: string | null;
      payment_ref_num: string | null;
      private_note: string | null;
      payload_json: unknown;
    }>(
      `
        SELECT qbo_id, qbo_sync_token, customer_qbo_id, txn_date::text AS txn_date,
               total_cents, deposit_to_account_qbo_id, payment_method_name, payment_ref_num,
               private_note, payload_json
        FROM mdata.qbo_ar_payments
        WHERE operating_company_id = $1::uuid
          AND active = true
          AND total_cents > 0
        ORDER BY txn_date NULLS LAST, qbo_id
      `,
      [operatingCompanyId]
    );

    for (const m of mirror.rows) {
      const totalCents = Number(m.total_cents ?? 0);

      // Resolve the payer customer (QBO Payment CustomerRef) — REQUIRED (accounting.payments.customer_id
      // is NOT NULL). Never invent a customer: skip and leave in the mirror for a later customers pull.
      let customerUuid: string | null = null;
      if (m.customer_qbo_id) {
        const c = await client.query<{ id: string }>(
          `SELECT id::text FROM mdata.customers WHERE operating_company_id = $1::uuid AND qbo_customer_id = $2 LIMIT 1`,
          [operatingCompanyId, m.customer_qbo_id]
        );
        customerUuid = c.rows[0]?.id ?? null;
      }
      if (!customerUuid) {
        customersUnresolved += 1;
        continue;
      }

      // Resolve QBO DepositToAccountRef to the local CoA id first, then reuse the posting engine's
      // customer-payment resolver. That resolver validates the account is postable, handles a legacy
      // banking.bank_accounts id through ledger_account_id, and falls back to the company cash-like role.
      // QBO-sourced payments remain subledger-only; the posting engine refuses their GL posting.
      let qboDepositAccountId: string | null = null;
      if (m.deposit_to_account_qbo_id) {
        const a = await client.query<{ id: string }>(
          `
            SELECT id::text FROM catalogs.accounts
            WHERE operating_company_id = $1::uuid AND qbo_account_id = $2 AND deactivated_at IS NULL
            LIMIT 1
          `,
          [operatingCompanyId, m.deposit_to_account_qbo_id]
        );
        qboDepositAccountId = a.rows[0]?.id ?? null;
      }
      const depositAccountUuid = await resolveCustomerPaymentDepositAccount(client, operatingCompanyId, qboDepositAccountId);

      const paymentMethod = mapPaymentMethod(m.payment_method_name);
      const paymentDate = m.txn_date ?? new Date().toISOString().slice(0, 10);

      // Idempotent header: does this QBO Payment already have a projected row? display_id is
      // server-generated (Rule 03) and must be assigned ONCE — never regenerated on re-run — so this is a
      // check-then-act (not a single INSERT..ON CONFLICT) unlike the AP/expense projections, which don't
      // carry a display_id. The partial-unique uq_payments_company_qbo_payment_id is the safety net against
      // a race (this projection runs single-threaded per company from the scheduler tick).
      const existing = await client.query<{ id: string }>(
        `SELECT id::text FROM accounting.payments WHERE operating_company_id = $1::uuid AND qbo_payment_id = $2 LIMIT 1`,
        [operatingCompanyId, m.qbo_id]
      );

      let paymentId: string;
      if (existing.rows[0]?.id) {
        paymentId = existing.rows[0].id;
        await client.query(
          `
            UPDATE accounting.payments
            SET customer_id = $1::uuid,
                payment_date = $2::date,
                amount_cents = $3,
                reference = $4,
                deposited_to_account_id = $5,
                payment_method = $6,
                notes = $7,
                qbo_sync_token = $8,
                source = 'qbo_clone',
                last_qbo_synced_at = now()
            WHERE id = $9::uuid
          `,
          [
            customerUuid,
            paymentDate,
            totalCents,
            m.payment_ref_num,
            depositAccountUuid,
            paymentMethod,
            m.private_note,
            m.qbo_sync_token,
            paymentId,
          ]
        );
      } else {
        const displayId = await nextPaymentDisplayId(client, operatingCompanyId, new Date(`${paymentDate}T00:00:00.000Z`));
        const ins = await client.query<{ id: string }>(
          `
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
            VALUES ($1::uuid,$2::uuid,$3,$4,$5::date,$6,$7,$8,$9,'qbo_sync',$10,$11,'qbo','qbo_clone',now())
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
            RETURNING id::text
          `,
          [
            operatingCompanyId,
            customerUuid,
            displayId,
            paymentMethod,
            paymentDate,
            m.payment_ref_num,
            totalCents,
            depositAccountUuid,
            m.private_note,
            m.qbo_id,
            m.qbo_sync_token,
          ]
        );
        const newId = ins.rows[0]?.id;
        if (!newId) continue;
        paymentId = newId;
      }
      paymentsProjected += 1;

      // Stage 2b — fan out Line[].LinkedTxn(Invoice) allocations. Unresolved invoices (not yet mirrored
      // into accounting.invoices) are SKIPPED and counted — never invented; the mirror payload_json keeps
      // the allocation available for a later pass once the invoice exists.
      const allocations = parsePaymentLinkedInvoices(m.payload_json);
      for (const alloc of allocations) {
        const inv = await client.query<{ id: string }>(
          `SELECT id::text FROM accounting.invoices WHERE operating_company_id = $1::uuid AND qbo_invoice_id = $2 LIMIT 1`,
          [operatingCompanyId, alloc.invoiceQboId]
        );
        const invoiceUuid = inv.rows[0]?.id;
        if (!invoiceUuid) {
          applicationsUnlinked += 1;
          continue;
        }
        await client.query(
          `
            INSERT INTO accounting.payment_applications (
              operating_company_id,
              payment_id,
              invoice_id,
              target_kind,
              target_id,
              amount_cents,
              amount_applied
            )
            VALUES ($1::uuid, $2::uuid, $3::uuid, 'invoice', $3::uuid, $4, $5)
            ON CONFLICT (payment_id, target_kind, target_id)
            DO UPDATE SET
              invoice_id = EXCLUDED.invoice_id,
              amount_cents = EXCLUDED.amount_cents,
              amount_applied = EXCLUDED.amount_applied
          `,
          [operatingCompanyId, paymentId, invoiceUuid, alloc.amountCents, alloc.amountCents / 100]
        );
        applicationsProjected += 1;
      }
    }
  });

  return { enabled, paymentsProjected, customersUnresolved, applicationsProjected, applicationsUnlinked, projectedAt };
}
