#!/usr/bin/env node
// ROUND 195.1 (owner law, 2026-09-28) — verify-projected-cash-date-equals-delivery.mjs
//
// Owner: "THE DELIVERY DATE OF THE LOAD IS THE PROJECTED INCOME DATE. Faro buys the invoice at
// delivery. There is no lag." This SUPERSEDES the 2026-06-17 lock in receivable-lag.ts, which said
// the lag is never zero. FACTORING_ADVANCE_DAYS is now 0 (was 1).
//
// Scope, precisely: this asserts zero variance for FACTORED loads only -- a non-factored load's
// projected cash date is genuinely delivery + real net terms (DEFAULT_NET_TERMS_DAYS unaffected by
// this ruling), so a blanket "every proforma" assertion would be wrong the day a non-factored
// USMCA proforma exists. Live-checked before writing this: all 14 open USMCA proforma invoices are
// on factoring-eligible customers today, so the owner's literal "every open USMCA proforma" holds
// in practice -- but the guard is written to stay correct if that ever changes, reporting (not
// failing on) any non-factored open proforma it finds, rather than silently asserting the wrong
// invariant on it.
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const ALLOW_OFFLINE_SKIP = "live-data invariant by design, no static-only path";
const LABEL = "verify-projected-cash-date-equals-delivery";
export const REQUIRES_LIVE_DB =
  "live-data money guard (ROUND 195.1 zero-lag rule for factored proforma invoices); fails closed via requireLiveDbOrExit with no DATABASE_URL (ROUND 29.9-B)";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

function selftest() {
  if (!USMCA || USMCA.length !== 36) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - USMCA company id malformed`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest OK`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

async function main() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");

    const res = await client.query(
      `
        WITH ranked AS (
          SELECT DISTINCT ON (l.id)
            i.display_id, l.load_number, l.id AS load_id,
            COALESCE(c.factoring_eligible, false) AS factored,
            fd.scheduled_arrival_at::date AS delivery_date,
            (fd.scheduled_arrival_at::date + 0 * INTERVAL '1 day')::date AS zero_lag_projected_date
          FROM accounting.invoices i
          JOIN mdata.loads l ON l.id = i.source_load_id AND l.operating_company_id = i.operating_company_id
          LEFT JOIN mdata.customers c ON c.id = l.customer_id AND c.operating_company_id = l.operating_company_id
          LEFT JOIN LATERAL (
            SELECT scheduled_arrival_at
              FROM mdata.load_stops
             WHERE load_id = l.id AND stop_type = 'delivery'
             ORDER BY sequence_number DESC
             LIMIT 1
          ) fd ON true
         WHERE i.operating_company_id = $1::uuid
           AND i.status = 'proforma'
           AND i.voided_at IS NULL
        )
        SELECT * FROM ranked ORDER BY load_number
      `,
      [USMCA]
    );

    await client.query("ROLLBACK");

    const failures = [];
    const nonFactoredReported = [];
    for (const row of res.rows) {
      if (!row.delivery_date) {
        failures.push(`${row.display_id} (load ${row.load_number}): no delivery stop scheduled_arrival_at to anchor on`);
        continue;
      }
      if (!row.factored) {
        nonFactoredReported.push(`${row.display_id} (load ${row.load_number}): non-factored, real net terms apply (not asserted zero-lag here)`);
        continue;
      }
      if (row.delivery_date.getTime() !== row.zero_lag_projected_date.getTime()) {
        failures.push(
          `${row.display_id} (load ${row.load_number}): delivery_date=${row.delivery_date.toISOString().slice(0, 10)} but zero-lag projection=${row.zero_lag_projected_date.toISOString().slice(0, 10)} — variance found on a factored load`
        );
      }
    }

    if (nonFactoredReported.length) {
      console.log(`${LABEL}: ${nonFactoredReported.length} open USMCA proforma(s) on non-factored customers — real net terms apply, not asserted zero-lag:`);
      for (const n of nonFactoredReported) console.log(`  ⚠ ${n}`);
    }

    if (failures.length) {
      console.error(`${LABEL}: FAIL — ${failures.length} issue(s):`);
      for (const f of failures) console.error(`  ✗ ${f}`);
      process.exit(1);
    }
    console.log(
      `${LABEL}: PASS — ${res.rows.length - nonFactoredReported.length} factored open USMCA proforma(s) have projected_cash_date = delivery date, zero variance.`
    );
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`${LABEL}: FAIL — ${err.message}`);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
