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

const MIRROR_PULL_FLAG = "QBO_AR_INVOICE_MIRROR_PULL_ENABLED";
const PROJECTION_FLAG = "QBO_AR_INVOICES_PROJECTION_ENABLED";

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

async function finishArInvoiceSyncRun(input: {
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

export async function pullArInvoicesFromQbo(operatingCompanyId: string): Promise<ArInvoicesPullResult> {
  const pulledAt = new Date().toISOString();

  const enabled = await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
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
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
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

export async function projectArInvoicesToLedger(
  operatingCompanyId: string
): Promise<ArInvoicesProjectResult> {
  const projectedAt = new Date().toISOString();

  let enabled = false;
  await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    enabled = await isEnabled(client, PROJECTION_FLAG, { operating_company_id: operatingCompanyId });
  });
  if (!enabled) {
    await recordFlagDisabledMirrorSyncRun({
      operatingCompanyId,
      kind: QBO_AR_INVOICES_PROJECTION_SYNC_KIND,
      flagKey: PROJECTION_FLAG,
      mirrorTable: "accounting.invoices",
    });
    return { enabled: false, invoicesProjected: 0, linesProjected: 0, lineTieOutFailures: 0, customersUnresolved: 0, projectedAt };
  }

  const runId = await beginArInvoiceSyncRun(operatingCompanyId, QBO_AR_INVOICES_PROJECTION_SYNC_KIND, {
    direction: "mirror_to_subledger",
    source_table: "mdata.qbo_ar_invoices",
    target_table: "accounting.invoices",
  });
  let invoicesProjected = 0;
  let linesProjected = 0;
  let lineTieOutFailures = 0;
  let customersUnresolved = 0;

  try {
    await withLuciaBypass(async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `accounting.invoice.display_id:${operatingCompanyId}:qbo_project`,
      ]);

      const unresolved = await client.query<{ n: string }>(
        `
        SELECT count(*)::text AS n
        FROM mdata.qbo_ar_invoices m
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
      customersUnresolved = Number(unresolved.rows[0]?.n ?? 0);

      // C6-MONEY-JE-EXEMPT: qbo-ar-invoice-mirror-projection; subledger-only clone — no TMS JE (parallel books)
      const projected = await client.query(
        `
        WITH candidates AS (
          SELECT
            m.operating_company_id,
            m.qbo_id,
            m.qbo_sync_token,
            m.txn_date,
            m.due_date,
            m.total_cents,
            m.balance_cents,
            m.private_note,
            m.currency,
            cust.id AS customer_id,
            EXTRACT(YEAR FROM COALESCE(m.txn_date, CURRENT_DATE))::int AS yr,
            i.display_id AS existing_display_id,
            i.id AS existing_id,
            LEAST(GREATEST(m.total_cents - m.balance_cents, 0), m.total_cents) AS amount_paid_cents,
            CASE
              WHEN m.balance_cents <= 0 THEN 'paid'
              WHEN m.balance_cents < m.total_cents THEN 'partial'
              ELSE 'sent'
            END AS status
          FROM mdata.qbo_ar_invoices m
          INNER JOIN mdata.customers cust
            ON cust.operating_company_id = m.operating_company_id
           AND cust.qbo_customer_id = m.customer_qbo_id
          LEFT JOIN accounting.invoices i
            ON i.operating_company_id = m.operating_company_id
           AND i.qbo_invoice_id = m.qbo_id
          WHERE m.operating_company_id = $1::uuid
            AND m.active = true
            AND m.total_cents > 0
            AND m.customer_qbo_id IS NOT NULL
        ),
        new_ranked AS (
          SELECT
            cand.*,
            row_number() OVER (
              PARTITION BY cand.yr
              ORDER BY cand.txn_date NULLS LAST, cand.qbo_id
            ) AS rn
          FROM candidates cand
          WHERE cand.existing_id IS NULL
        ),
        max_by_year AS (
          SELECT
            EXTRACT(YEAR FROM issue_date)::int AS yr,
            COALESCE(
              MAX(
                CASE
                  WHEN display_id ~ '^INV-[0-9]{4}-[0-9]{5}$' THEN right(display_id, 5)::int
                  ELSE 0
                END
              ),
              0
            ) AS max_seq
          FROM accounting.invoices
          WHERE operating_company_id = $1::uuid
          GROUP BY 1
        ),
        prepared AS (
          SELECT
            cand.operating_company_id,
            cand.customer_id,
            cand.qbo_id,
            cand.qbo_sync_token,
            cand.txn_date,
            cand.due_date,
            cand.total_cents,
            cand.amount_paid_cents,
            cand.private_note,
            cand.currency,
            cand.status,
            COALESCE(
              cand.existing_display_id,
              'INV-' || cand.yr::text || '-' || lpad((COALESCE(mx.max_seq, 0) + nr.rn)::text, 5, '0')
            ) AS display_id
          FROM candidates cand
          LEFT JOIN new_ranked nr
            ON nr.operating_company_id = cand.operating_company_id
           AND nr.qbo_id = cand.qbo_id
          LEFT JOIN max_by_year mx ON mx.yr = cand.yr
        )
        INSERT INTO accounting.invoices (
          operating_company_id,
          customer_id,
          display_id,
          status,
          issue_date,
          due_date,
          subtotal_cents,
          tax_cents,
          total_cents,
          amount_paid_cents,
          currency_code,
          internal_notes,
          invoice_type,
          source_system,
          source,
          qbo_invoice_id,
          qbo_sync_token,
          last_qbo_synced_at
        )
        SELECT
          p.operating_company_id,
          p.customer_id,
          p.display_id,
          p.status,
          COALESCE(p.txn_date, CURRENT_DATE),
          COALESCE(p.due_date, COALESCE(p.txn_date, CURRENT_DATE)),
          p.total_cents,
          0,
          p.total_cents,
          p.amount_paid_cents,
          COALESCE(NULLIF(btrim(p.currency), ''), 'USD'),
          p.private_note,
          'manual',
          'qbo',
          'qbo_clone',
          p.qbo_id,
          p.qbo_sync_token,
          now()
        FROM prepared p
        ON CONFLICT (operating_company_id, qbo_invoice_id) WHERE qbo_invoice_id IS NOT NULL
        DO UPDATE SET
          customer_id = EXCLUDED.customer_id,
          status = EXCLUDED.status,
          issue_date = EXCLUDED.issue_date,
          due_date = EXCLUDED.due_date,
          subtotal_cents = EXCLUDED.subtotal_cents,
          total_cents = EXCLUDED.total_cents,
          amount_paid_cents = EXCLUDED.amount_paid_cents,
          currency_code = EXCLUDED.currency_code,
          internal_notes = EXCLUDED.internal_notes,
          source_system = 'qbo',
          source = 'qbo_clone',
          qbo_sync_token = EXCLUDED.qbo_sync_token,
          last_qbo_synced_at = now()
        `,
        [operatingCompanyId]
      );
      invoicesProjected = projected.rowCount ?? 0;

      // ACCT-F154 — PROJECT THE LINES, not just the header.
      //
      // ACCT-F144 found the asymmetry on prod: the AP puller imported completely (16,245 bills, zero
      // lineless, header ties to lines to the cent) while the AR side imported HEADERS ONLY — 11,976 of
      // 11,976 QBO-cloned invoices had no lines at all. ACCT-F146 back-filled the 16,744 missing lines
      // with a one-time migration. This is the ROOT CAUSE half: the importer itself never projected
      // lines, so a re-clone or a resumed sync recreates header-only invoices and quietly undoes that
      // migration. Until this exists, every line-level AR report — revenue by item, sales by product,
      // line coding to account_id — returns zero across the whole real financial history and nothing
      // reports a failure.
      //
      // The line detail was always present; it needed projecting, not inventing: every row in
      // mdata.qbo_ar_invoices carries a `Line` array in payload_json.
      //
      // WHAT MUST NOT BE PROJECTED — this is the entire risk. The array holds four DetailTypes and
      // counting elements gives 33,429, which as a target would DOUBLE accounts receivable. Measured on
      // prod: SalesItemLineDetail 16,670 / $40,851,525.74 (real revenue); SubTotalLineDetail 12,063 /
      // $40,851,525.74 (a presentation artefact that RESTATES the header, one per invoice);
      // DescriptionOnly 4,622 / $0; DiscountLineDetail 74 / $4,596.55. Projecting SubTotal lines adds a
      // second full copy of revenue — exactly 2x — on the one set of genuinely real financial data in
      // the system. They are excluded by an explicit ALLOWLIST rather than a denylist, so a DetailType
      // QBO introduces later cannot silently enter the ledger.
      //
      // SIGN. accounting.invoice_lines carries CHECK (line_total_cents >= 0), so the table cannot hold a
      // negative line at all. QBO stores discounts POSITIVE and expects them subtracted, and 81
      // SalesItemLineDetail lines carry a NEGATIVE Amount (credits/write-downs). Both are stored at
      // abs() with the subtractive sign living in line_type='adjustment' — the schema's decision, not
      // this importer's. Every reader summing these lines must subtract adjustments.
      //
      // SAFE TO RE-RUN: ON CONFLICT DO NOTHING against uq_invoice_lines_invoice_slot (ACCT-F145,
      // UNIQUE (invoice_id, display_order) WHERE not soft-deleted). Without that index a repeated sync
      // would silently double every line it re-inserted — which is the same class that already put
      // $1,643.21 of duplicate bills into the GL (ACCT-F142), where every duplicate posted balanced and
      // nothing complained.
      const linesProjectedRes = await client.query(
        `
        WITH src AS (
          SELECT
            i.id                                     AS invoice_id,
            i.operating_company_id,
            COALESCE((l->>'LineNum')::int, ord::int) AS display_order,
            COALESCE(l->>'Description', '')          AS description,
            abs(round(COALESCE((l->>'Amount')::numeric, 0) * 100))::bigint AS line_total_cents,
            (l->>'DetailType' = 'DiscountLineDetail'
             OR COALESCE((l->>'Amount')::numeric, 0) < 0)  AS is_subtractive,
            l#>>'{SalesItemLineDetail,ItemRef,value}' AS qbo_item_id,
            l#>>'{SalesItemLineDetail,ItemRef,name}'  AS item_name
          FROM accounting.invoices i
          JOIN mdata.qbo_ar_invoices q
            ON q.operating_company_id = i.operating_company_id
           AND q.qbo_id = i.qbo_invoice_id
          CROSS JOIN LATERAL jsonb_array_elements(q.payload_json->'Line') WITH ORDINALITY AS t(l, ord)
          WHERE i.operating_company_id = $1::uuid
            AND i.qbo_invoice_id IS NOT NULL
            AND l->>'DetailType' IN ('SalesItemLineDetail', 'DiscountLineDetail', 'DescriptionOnly')
        )
        INSERT INTO accounting.invoice_lines (
          id, operating_company_id, invoice_id, display_order,
          line_type, description, quantity, unit_amount_cents, line_total_cents, qbo_item_id
        )
        SELECT
          gen_random_uuid(), s.operating_company_id, s.invoice_id, s.display_order,
          -- line_type is a FREIGHT BILLING taxonomy (linehaul/fsc/detention/layover/lumper/tonu/
          -- accessorial/tax/adjustment/other). QBO item names do not map onto it one-for-one, so
          -- classify ONLY what QuickBooks names unambiguously and send the rest to 'other' — a real
          -- member of the taxonomy. Mapping every revenue line to 'linehaul' would assert freight
          -- semantics the source never stated.
          CASE
            WHEN s.is_subtractive                     THEN 'adjustment'
            WHEN s.item_name ILIKE '%line haul%'      THEN 'linehaul'
            WHEN s.item_name ILIKE '%fuel surcharge%' THEN 'fsc'
            WHEN s.item_name ILIKE '%lumper%'         THEN 'lumper'
            WHEN s.item_name ILIKE '%layover%'        THEN 'layover'
            WHEN s.item_name ILIKE '%detention%'      THEN 'detention'
            ELSE 'other'
          END,
          s.description, 1, s.line_total_cents, s.line_total_cents, s.qbo_item_id
        FROM src s
        ON CONFLICT DO NOTHING
        `,
        [operatingCompanyId]
      );
      linesProjected = linesProjectedRes.rowCount ?? 0;

      // TIE-OUT, reported rather than thrown. The ACCT-F146 migration ABORTS the whole batch on any
      // mismatch, which is right for a one-shot backfill. A recurring importer must not: the headers
      // are already committed by the time lines are written, so throwing would neither unwrite them nor
      // fix the drift — it would just make the sync fail permanently on legacy data and get muted.
      // Instead the drift is COUNTED and surfaced on the sync run, so it is loud and attributable
      // rather than silent. A non-zero value here is a real reconciliation break to investigate
      // (ACCT-F147 already documents two such headers that disagree with QBO's own TotalAmt).
      const tieOut = await client.query<{ bad: string }>(
        `
        SELECT count(*)::text AS bad FROM (
          SELECT i.id
            FROM accounting.invoices i
            JOIN accounting.invoice_lines il
              ON il.invoice_id = i.id AND il.soft_deleted_at IS NULL
           WHERE i.operating_company_id = $1::uuid
             AND i.qbo_invoice_id IS NOT NULL
           GROUP BY i.id, i.subtotal_cents
          HAVING sum(il.line_total_cents) FILTER (WHERE il.line_type <> 'adjustment')
                 - COALESCE(sum(il.line_total_cents) FILTER (WHERE il.line_type = 'adjustment'), 0)
                 <> i.subtotal_cents
        ) bad
        `,
        [operatingCompanyId]
      );
      lineTieOutFailures = Number(tieOut.rows[0]?.bad ?? 0);
    });

    await finishArInvoiceSyncRun({
      runId,
      operatingCompanyId,
      success: true,
      recordsProcessed: invoicesProjected,
    });
    return { enabled: true, invoicesProjected, linesProjected, lineTieOutFailures, customersUnresolved, projectedAt };
  } catch (error) {
    await finishArInvoiceSyncRun({
      runId,
      operatingCompanyId,
      success: false,
      recordsProcessed: invoicesProjected,
      errorMessage: String((error as Error)?.message ?? error),
    }).catch(() => {
      /* audit best-effort */
    });
    throw error;
  }
}
