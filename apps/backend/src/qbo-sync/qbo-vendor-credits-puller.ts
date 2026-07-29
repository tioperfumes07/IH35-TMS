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

const MIRROR_PULL_FLAG = "QBO_VENDOR_CREDIT_MIRROR_PULL_ENABLED";
const PROJECTION_FLAG = "QBO_VENDOR_CREDITS_PROJECTION_ENABLED";

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
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
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
 * Stage 1 — clone QBO VendorCredits into mdata.qbo_vendor_credits. Idempotent (upsert by qbo_id).
 * No-op unless QBO_VENDOR_CREDIT_MIRROR_PULL_ENABLED is ON for this entity.
 */
export async function pullVendorCreditsFromQbo(operatingCompanyId: string): Promise<VendorCreditsPullResult> {
  const pulledAt = new Date().toISOString();

  const enabled = await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
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
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
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
 * Stage 2 — project mdata.qbo_vendor_credits → accounting.vendor_credits (subledger only, no GL).
 * Set-based INSERT…SELECT. Skips unresolved vendors. Preserves display_id on upsert.
 */
export async function projectVendorCreditsToLedger(
  operatingCompanyId: string
): Promise<VendorCreditsProjectResult> {
  const projectedAt = new Date().toISOString();

  let enabled = false;
  await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    enabled = await isEnabled(client, PROJECTION_FLAG, { operating_company_id: operatingCompanyId });
  });
  if (!enabled) {
    await recordFlagDisabledMirrorSyncRun({
      operatingCompanyId,
      kind: QBO_VENDOR_CREDITS_PROJECTION_SYNC_KIND,
      flagKey: PROJECTION_FLAG,
      mirrorTable: "accounting.vendor_credits",
    });
    return { enabled: false, creditsProjected: 0, vendorsUnresolved: 0, projectedAt };
  }

  const runId = await beginVendorCreditSyncRun(operatingCompanyId, QBO_VENDOR_CREDITS_PROJECTION_SYNC_KIND, {
    direction: "mirror_to_subledger",
    source_table: "mdata.qbo_vendor_credits",
    target_table: "accounting.vendor_credits",
  });
  let creditsProjected = 0;
  let vendorsUnresolved = 0;

  try {
    await withLuciaBypass(async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);

      const unresolved = await client.query<{ n: string }>(
        `
        SELECT count(*)::text AS n
        FROM mdata.qbo_vendor_credits m
        WHERE m.operating_company_id = $1::uuid
          AND m.active = true
          AND m.total_cents > 0
          AND (
            m.vendor_qbo_id IS NULL
            OR NOT EXISTS (
              SELECT 1 FROM mdata.vendors v
              WHERE v.operating_company_id = m.operating_company_id
                AND v.qbo_vendor_id = m.vendor_qbo_id
            )
          )
        `,
        [operatingCompanyId]
      );
      vendorsUnresolved = Number(unresolved.rows[0]?.n ?? 0);

      const projected = await client.query(
        `
        WITH candidates AS (
          SELECT
            m.operating_company_id,
            m.qbo_id,
            m.qbo_sync_token,
            m.txn_date,
            m.total_cents,
            m.balance_cents,
            m.private_note,
            v.id::text AS vendor_uuid,
            EXTRACT(YEAR FROM COALESCE(m.txn_date, CURRENT_DATE))::int AS yr,
            vc.display_id AS existing_display_id,
            vc.id AS existing_id,
            LEAST(GREATEST(m.total_cents - m.balance_cents, 0), m.total_cents) AS amount_applied_cents,
            CASE WHEN m.balance_cents <= 0 THEN 'applied' ELSE 'open' END AS status
          FROM mdata.qbo_vendor_credits m
          INNER JOIN mdata.vendors v
            ON v.operating_company_id = m.operating_company_id
           AND v.qbo_vendor_id = m.vendor_qbo_id
          LEFT JOIN accounting.vendor_credits vc
            ON vc.operating_company_id = m.operating_company_id
           AND vc.qbo_id = m.qbo_id
          WHERE m.operating_company_id = $1::uuid
            AND m.active = true
            AND m.total_cents > 0
            AND m.vendor_qbo_id IS NOT NULL
        ),
        new_ranked AS (
          SELECT
            c.*,
            row_number() OVER (
              PARTITION BY c.yr
              ORDER BY c.txn_date NULLS LAST, c.qbo_id
            ) AS rn
          FROM candidates c
          WHERE c.existing_id IS NULL
        ),
        max_by_year AS (
          SELECT
            EXTRACT(YEAR FROM issue_date)::int AS yr,
            COALESCE(
              MAX(
                CASE
                  WHEN display_id ~ '^VC-[0-9]{4}-[0-9]{4}$' THEN right(display_id, 4)::int
                  ELSE 0
                END
              ),
              0
            ) AS max_seq
          FROM accounting.vendor_credits
          WHERE operating_company_id = $1::uuid
          GROUP BY 1
        ),
        prepared AS (
          SELECT
            c.operating_company_id,
            c.vendor_uuid,
            c.qbo_id,
            c.qbo_sync_token,
            c.txn_date,
            c.total_cents,
            c.amount_applied_cents,
            c.private_note,
            c.status,
            COALESCE(
              c.existing_display_id,
              'VC-' || c.yr::text || '-' || lpad((COALESCE(mx.max_seq, 0) + nr.rn)::text, 4, '0')
            ) AS display_id
          FROM candidates c
          LEFT JOIN new_ranked nr
            ON nr.operating_company_id = c.operating_company_id
           AND nr.qbo_id = c.qbo_id
          LEFT JOIN max_by_year mx ON mx.yr = c.yr
        )
        INSERT INTO accounting.vendor_credits (
          operating_company_id,
          vendor_id,
          display_id,
          status,
          issue_date,
          amount_cents,
          amount_applied_cents,
          notes,
          qbo_id,
          source_system,
          qbo_sync_token,
          last_qbo_synced_at
        )
        SELECT
          p.operating_company_id,
          p.vendor_uuid,
          p.display_id,
          p.status,
          COALESCE(p.txn_date, CURRENT_DATE),
          p.total_cents,
          p.amount_applied_cents,
          p.private_note,
          p.qbo_id,
          'qbo',
          p.qbo_sync_token,
          now()
        FROM prepared p
        ON CONFLICT (operating_company_id, qbo_id) WHERE qbo_id IS NOT NULL
        DO UPDATE SET
          vendor_id = EXCLUDED.vendor_id,
          status = EXCLUDED.status,
          issue_date = EXCLUDED.issue_date,
          amount_cents = EXCLUDED.amount_cents,
          amount_applied_cents = EXCLUDED.amount_applied_cents,
          notes = EXCLUDED.notes,
          source_system = 'qbo',
          qbo_sync_token = EXCLUDED.qbo_sync_token,
          last_qbo_synced_at = now()
        `,
        [operatingCompanyId]
      );
      creditsProjected = projected.rowCount ?? 0;
    });

    await finishVendorCreditSyncRun({
      runId,
      operatingCompanyId,
      success: true,
      recordsProcessed: creditsProjected,
    });
    return { enabled: true, creditsProjected, vendorsUnresolved, projectedAt };
  } catch (error) {
    await finishVendorCreditSyncRun({
      runId,
      operatingCompanyId,
      success: false,
      recordsProcessed: creditsProjected,
      errorMessage: String((error as Error)?.message ?? error),
    }).catch(() => {
      /* audit best-effort */
    });
    throw error;
  }
}
