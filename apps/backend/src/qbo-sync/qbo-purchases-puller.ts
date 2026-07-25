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
//                       idempotent. posting_status stays 'unposted' — NO GL/journal posting is performed
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
import { QBO_PURCHASES_MIRROR_SYNC_KIND } from "./qbo-purchases-sync-kind.js";
import { recordFlagDisabledMirrorSyncRun } from "./record-flag-disabled-sync-run.js";

// Default-OFF financial flags (financial cluster — HOLD for owner approval). SINGLE SOURCE OF TRUTH is the
// DB feature flag resolved PER-ENTITY via isEnabled() (lib.feature_flag_overrides keyed on
// operating_company_id) — NOT a process.env var. isEnabled() returns false when the flag row/override is
// absent, so an unregistered flag stays SAFE-OFF.
const PURCHASES_MIRROR_PULL_FLAG = "QBO_PURCHASES_MIRROR_PULL_ENABLED";
const EXPENSES_PROJECTION_FLAG = "QBO_EXPENSES_PROJECTION_ENABLED";

export { QBO_PURCHASES_MIRROR_SYNC_KIND };

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
export async function beginPurchasesMirrorSyncRun(operatingCompanyId: string): Promise<string | null> {
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
        QBO_PURCHASES_MIRROR_SYNC_KIND,
        JSON.stringify({
          direction: "qbo_to_tms",
          mirror_table: "mdata.qbo_purchases",
          source_id_key: "qbo_id",
        }),
      ]
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
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
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
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
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
 * Stage 2 + 2b — project the QBO Purchase mirror into accounting.expenses (header) + accounting.expense_lines.
 * Idempotent: header upsert on uq_expenses_company_qbo_purchase_id; lines upsert on UNIQUE(expense_id,
 * line_sequence) (delete-free — void-not-delete). posting_status stays 'unposted' (NO GL — QuickBooks owns
 * GL for qbo-sourced rows; the posting engine refuses to post them). No-op unless the
 * QBO_EXPENSES_PROJECTION_ENABLED flag is ON for this entity.
 */
export async function projectPurchasesToExpenses(operatingCompanyId: string): Promise<PurchasesProjectResult> {
  const projectedAt = new Date().toISOString();

  let enabled = false;
  let expensesProjected = 0;
  let linesProjected = 0;

  await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    enabled = await isEnabled(client, EXPENSES_PROJECTION_FLAG, { operating_company_id: operatingCompanyId });
    if (!enabled) return;

    const mirror = await client.query<{
      qbo_id: string;
      entity_qbo_id: string | null;
      entity_type: string | null;
      txn_date: string | null;
      total_cents: string | number;
      private_note: string | null;
      payload_json: unknown;
    }>(
      `
        SELECT qbo_id, entity_qbo_id, entity_type, txn_date::text AS txn_date,
               total_cents, private_note, payload_json
        FROM mdata.qbo_purchases
        WHERE operating_company_id = $1::uuid
          AND active = true
          AND total_cents > 0
        ORDER BY txn_date NULLS LAST, qbo_id
      `,
      [operatingCompanyId]
    );

    for (const m of mirror.rows) {
      const totalCents = Number(m.total_cents ?? 0);
      // Resolve the payee vendor (QBO Purchase EntityRef of type Vendor) — nullable link.
      let vendorUuid: string | null = null;
      if (m.entity_qbo_id && (m.entity_type == null || m.entity_type === "Vendor")) {
        const v = await client.query<{ id: string }>(
          `
            SELECT id::text FROM mdata.vendors
            WHERE operating_company_id = $1::uuid AND qbo_vendor_id = $2
            LIMIT 1
          `,
          [operatingCompanyId, m.entity_qbo_id]
        );
        vendorUuid = v.rows[0]?.id ?? null;
      }

      // Stage 2 — upsert the expense header. status='posted' (finalized doc); posting_status='unposted'
      // (NO TMS GL — QuickBooks owns GL for the qbo-sourced row).
      const header = await client.query<{ id: string }>(
        `
          INSERT INTO accounting.expenses (
            operating_company_id,
            qbo_purchase_id,
            vendor_uuid,
            transaction_date,
            total_amount_cents,
            memo,
            status,
            posting_status,
            qbo_sync_pending,
            is_active,
            created_at,
            updated_at
          )
          VALUES ($1::uuid, $2, $3::uuid, COALESCE($4::date, CURRENT_DATE), $5, $6, 'posted', 'unposted', false, true, now(), now())
          ON CONFLICT (operating_company_id, qbo_purchase_id) WHERE qbo_purchase_id IS NOT NULL
          DO UPDATE SET
            vendor_uuid = EXCLUDED.vendor_uuid,
            transaction_date = EXCLUDED.transaction_date,
            total_amount_cents = EXCLUDED.total_amount_cents,
            memo = EXCLUDED.memo,
            is_active = true,
            updated_at = now()
          RETURNING id::text
        `,
        [operatingCompanyId, m.qbo_id, vendorUuid, m.txn_date, totalCents, m.private_note]
      );
      const expenseId = header.rows[0]?.id;
      if (!expenseId) continue;
      expensesProjected += 1;

      // Stage 2b — project lines. Synthesize a single header-total line when QBO shipped no usable lines.
      let parsed = parsePurchaseLines(m.payload_json);
      if (parsed.length === 0) {
        parsed = [{ amountCents: totalCents, description: m.private_note, accountQboId: null }];
      }

      let seq = 1;
      for (const line of parsed) {
        // Resolve the line's GL account via catalogs.accounts (entity-scoped, active, postable) — nullable.
        let expenseAccountUuid: string | null = null;
        if (line.accountQboId) {
          const a = await client.query<{ id: string }>(
            `
              SELECT id::text FROM catalogs.accounts
              WHERE operating_company_id = $1::uuid
                AND qbo_account_id = $2
                AND deactivated_at IS NULL
              LIMIT 1
            `,
            [operatingCompanyId, line.accountQboId]
          );
          expenseAccountUuid = a.rows[0]?.id ?? null;
        }
        await client.query(
          `
            INSERT INTO accounting.expense_lines (
              expense_id,
              line_sequence,
              amount,
              amount_cents,
              description,
              expense_account_uuid,
              ps_category_qbo_id,
              section
            )
            VALUES ($1::uuid, $2, $3, $4, $5, $6::uuid, $7, 'B')
            ON CONFLICT (expense_id, line_sequence)
            DO UPDATE SET
              amount = EXCLUDED.amount,
              amount_cents = EXCLUDED.amount_cents,
              description = EXCLUDED.description,
              expense_account_uuid = EXCLUDED.expense_account_uuid,
              ps_category_qbo_id = EXCLUDED.ps_category_qbo_id
          `,
          [
            expenseId,
            seq,
            line.amountCents / 100,
            line.amountCents,
            line.description,
            expenseAccountUuid,
            line.accountQboId,
          ]
        );
        linesProjected += 1;
        seq += 1;
      }
    }
  });

  return { enabled, expensesProjected, linesProjected, projectedAt };
}
