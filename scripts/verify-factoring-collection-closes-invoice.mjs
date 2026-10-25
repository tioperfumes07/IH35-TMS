#!/usr/bin/env node
/**
 * verify-factoring-collection-closes-invoice (step 18687 — CC-2 443.304 / LEAD row 77)
 *
 * Invariant: a factored invoice that has received a factoring_collection payment must have
 * amount_open_cents = 0 (i.e. be fully closed or at least have the payment fully applied).
 *
 * Finding ACCT-F443279 (row 77) — 0 customer payments / Faro purchases applied: all $621,076.72
 * open incl. 57 advanced invoices. The collection-apply engine (collection-apply.service.ts) is
 * now wired; this guard verifies no advanced/reserve_held invoice that has already received a
 * factoring_collection payment still shows amount_open_cents > 0.
 *
 * Root cause this prevents recurring: if the payment-application step in applyFaroCollectionInClientTx
 * is silently skipped or rolled back, the invoice stays open while the payment record exists —
 * the GL books show a credit that never closed A/R. This guard catches that gap.
 */
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const REQUIRES_LIVE_DB = "live count: advanced invoices with a factoring_collection payment but amount_open_cents > 0";
const LABEL = "verify-factoring-collection-closes-invoice";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

const { client, pool } = await requireLiveDbOrExit({ label: LABEL });

try {
  await client.query(`SELECT set_config('app.bypass_rls','lucia',true)`);
  await client.query(`SELECT set_config('app.operating_company_id','${USMCA}',true)`);

  // Factored invoices that received a factoring_collection payment but still carry an open balance.
  // A short-pay legitimately leaves a remainder — the dispute row is opened and the status stays
  // 'advanced'/'reserve_held' pending resolution. Those are excluded by NOT EXISTS(dispute). If
  // there is no open dispute, the full balance should have been applied.
  const leakRes = await client.query(
    `SELECT inv.id::text AS invoice_id,
            inv.display_id,
            inv.factoring_status,
            inv.amount_open_cents::bigint AS amount_open_cents,
            p.id::text AS payment_id,
            p.display_id AS payment_display_id,
            COALESCE(SUM(pa.amount_cents), 0)::bigint AS applied_cents
       FROM accounting.invoices inv
       JOIN accounting.payment_applications pa
         ON pa.target_id = inv.id
        AND pa.target_kind = 'invoice'
       JOIN accounting.payments p
         ON p.id = pa.payment_id
        AND p.payment_source_kind = 'factoring_collection'
        AND p.operating_company_id = $1::uuid
      WHERE inv.operating_company_id = $1::uuid
        AND inv.voided_at IS NULL
        AND inv.factoring_status IN ('advanced', 'reserve_held')
        AND inv.amount_open_cents > 0
        AND NOT EXISTS (
              SELECT 1 FROM accounting.invoice_disputes d
               WHERE d.invoice_id = inv.id
                 AND d.resolved_at IS NULL
            )
      GROUP BY inv.id, inv.display_id, inv.factoring_status, inv.amount_open_cents,
               p.id, p.display_id`,
    [USMCA]
  );

  if (leakRes.rows.length === 0) {
    console.log(
      `${LABEL}: PASS — 0 factored invoices with a collection payment that still carry an open balance (no unresolved short-pays)`
    );
    client.release();
    await pool.end();
    process.exit(0);
  }

  console.error(`${LABEL}: FAIL — ${leakRes.rows.length} factored invoice(s) have a factoring_collection payment but amount_open_cents > 0 with no open dispute:`);
  for (const row of leakRes.rows) {
    console.error(
      `  invoice ${row.display_id} (${row.invoice_id}) factoring_status=${row.factoring_status} open=${row.amount_open_cents}¢ ← payment ${row.payment_display_id} applied=${row.applied_cents}¢`
    );
  }
  client.release();
  await pool.end();
  process.exit(1);
} catch (err) {
  console.error(`${LABEL}: FAIL — unexpected error: ${err}`);
  try { client.release(); } catch (_) {}
  try { await pool.end(); } catch (_) {}
  process.exit(1);
}
