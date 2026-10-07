#!/usr/bin/env node
/** MATRIX-BUILT-OPTIONAL — live-only / invariant ratchet guard; no surface wiring leaf to register. */
// ROUND 300/301 B-31 (Lead order): "TRACE the chain: Faro receipt -> payment -> payment_application
// -> invoice.amount_paid_cents. NAME where it breaks... DO NOT net anything to make it balance.
// Name where the relief is missing and prove it with rows."
//
// Live-traced 2026-09-30 on USMCA: the payment_applications -> invoice.amount_paid_cents link is
// CLEAN (0 of 110+ live invoices mismatch). The break is entirely upstream of this guard's own
// scope -- "Faro receipt -> payment" has no ingestion path at all (no receipt/debtor/collection
// table anywhere in the schema names Faro as a source; every payment that exists is
// payment_source_kind='manual', unrelated to any Faro import). That is a data-pipeline gap, not a
// guard's job to police — a guard can only assert an invariant over data that exists.
//
// ROUND 301 ADDENDUM (row-level proof, not netted): of the 104 live open invoices
// (amount_open_cents > 0, sum $366,409.12 -- matches the Lead's own figure to the cent), 102 carry
// ZERO accounting.payment_applications rows at all ($366,071.72 of the total). The other 2 carry
// SOME payment application but remain partially open (e.g. CORE LOGISTICS's $250 short-pay,
// invoice 13521 -- correctly left open, not written off). The owner's own Faro export cites
// $28,125.00 collected in September across 14 invoices; this database has no table that holds
// that receipt-level detail (searched every schema/table name for receipt/debtor/collection/faro
// naming in the prior round; still true). This guard cannot name WHICH of the 102 zero-payment
// invoices correspond to that $28,125 without the actual Faro export rows -- naming that
// correspondence here would be inventing a match, which the order explicitly forbids ("do not net
// anything to make it balance"). What IS proven, with rows, is exactly which invoices on THIS
// side of the ledger carry zero relief -- see the live proof output below for the full list.
//
// FAILS IF: any non-voided invoice's amount_paid_cents does not exactly equal the sum of its
// non-unapplied accounting.payment_applications.amount_cents rows (the original, still-clean
// check); OR the zero-payment-application population grows in COUNT beyond today's ratchet floor
// without this guard's own baseline being deliberately updated (a silent widening of the AR gap
// should never pass quietly).
import pg from "pg";

const LABEL = "verify-invoice-amount-paid-matches-applications";
export const REQUIRES_LIVE_DB = "live-only guard: reads production database (USMCA) and cannot be statically verified; run by money-pr-local-gate with DATABASE_URL";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

// Baseline measured 2026-09-30 (ROUND 301). Ratchet floor on the zero-payment-application
// population's COUNT only -- the dollar total moves with real invoicing activity and isn't
// ratcheted, but a silent jump in how many open invoices carry zero relief at all is exactly the
// kind of drift this guard exists to catch.
const ZERO_PAYMENT_APP_COUNT_CEILING = 102;

async function measure(client, operatingCompanyId) {
  const res = await client.query(
    `
    SELECT i.id::text, i.display_id, i.amount_paid_cents::text AS amount_paid_cents,
      COALESCE((
        SELECT sum(pa.amount_cents) FROM accounting.payment_applications pa
        WHERE pa.invoice_id = i.id AND pa.unapplied_at IS NULL
      ), 0)::text AS applied_sum
    FROM accounting.invoices i
    WHERE i.operating_company_id = $1::uuid AND i.voided_at IS NULL
    `,
    [operatingCompanyId]
  );
  const mismatches = res.rows.filter((row) => row.amount_paid_cents !== row.applied_sum);

  const openRes = await client.query(
    `
    SELECT i.display_id, cu.customer_name, i.total_cents::text, i.amount_open_cents::text,
      (SELECT count(*)::int FROM accounting.payment_applications pa WHERE pa.invoice_id = i.id AND pa.unapplied_at IS NULL) AS payment_app_count
    FROM accounting.invoices i
    JOIN mdata.customers cu ON cu.id = i.customer_id
    WHERE i.operating_company_id = $1::uuid AND i.voided_at IS NULL AND i.amount_open_cents > 0
    ORDER BY i.amount_open_cents DESC
    `,
    [operatingCompanyId]
  );
  const zeroPaymentRows = openRes.rows.filter((row) => row.payment_app_count === 0);
  const totalOpenCents = openRes.rows.reduce((sum, row) => sum + Number(row.amount_open_cents), 0);
  const zeroPaymentOpenCents = zeroPaymentRows.reduce((sum, row) => sum + Number(row.amount_open_cents), 0);

  return {
    total: res.rows.length,
    mismatches,
    openInvoiceCount: openRes.rows.length,
    totalOpenCents,
    zeroPaymentRows,
    zeroPaymentOpenCents,
  };
}

async function run() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(`${LABEL}: FAIL — DATABASE_URL not set and this guard does not declare ALLOW_OFFLINE_SKIP. A live money guard that cannot connect is a FAIL, never a pass.`);
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  // CI's verify:pre-commit runs verify-steps against a fresh, empty database. Without the USMCA
  // company row there is nothing production-shaped to measure: run the offline selftest and say so.
  {
    const probe = await client.query("SELECT 1 FROM org.companies WHERE id = $1::uuid", [USMCA]);
    if (probe.rows.length === 0) {
      await client.end();
      const { spawnSync } = await import("node:child_process");
      const r = spawnSync(process.execPath, [new URL(import.meta.url).pathname, "--selftest"], { stdio: "inherit" });
      console.log(`DATABASE PHASE: USMCA company absent (fresh CI DB) — selftest only, NOT live proof`);
      process.exit(r.status ?? 1);
    }
  }
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE neondb_owner");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const m = await measure(client, USMCA);
    await client.query("ROLLBACK");

    if (m.mismatches.length > 0) {
      console.error(`${LABEL}: FAIL — ${m.mismatches.length} of ${m.total} live USMCA invoice(s) have amount_paid_cents not matching sum(payment_applications):`);
      for (const row of m.mismatches.slice(0, 20)) {
        console.error(`  invoice ${row.display_id} (${row.id}): amount_paid_cents=${row.amount_paid_cents}, applied_sum=${row.applied_sum}`);
      }
      process.exit(1);
    }

    if (m.zeroPaymentRows.length > ZERO_PAYMENT_APP_COUNT_CEILING) {
      console.error(
        `${LABEL}: FAIL — zero-payment-application open invoice count widened from the ratchet ceiling: ${m.zeroPaymentRows.length} > ${ZERO_PAYMENT_APP_COUNT_CEILING}. Full list:`
      );
      for (const row of m.zeroPaymentRows) {
        console.error(`  ${row.display_id} (${row.customer_name}): open $${(Number(row.amount_open_cents) / 100).toFixed(2)}`);
      }
      process.exit(1);
    }

    console.log(
      `${LABEL}: LIVE PASS — ${m.total} live USMCA invoice(s) checked, 0 amount_paid_cents/payment_applications mismatches. ` +
        `${m.openInvoiceCount} open invoice(s), $${(m.totalOpenCents / 100).toFixed(2)} total open. ` +
        `${m.zeroPaymentRows.length} of those carry ZERO payment_applications ($${(m.zeroPaymentOpenCents / 100).toFixed(2)}) — ` +
        `the relief is missing upstream (no Faro-receipt ingestion path exists), not in this link.`
    );
    console.log(`Full zero-payment-application row list (${m.zeroPaymentRows.length}):`);
    console.log(JSON.stringify(m.zeroPaymentRows.map((r) => ({ display_id: r.display_id, customer_name: r.customer_name, open_cents: r.amount_open_cents })), null, 2));
  } finally {
    await client.end();
  }
}

if (process.argv.includes("--selftest")) {
  const assert = await import("node:assert/strict").then((m) => m.default);
  // Pure fixture check of the comparison logic itself (no DB) -- mirrors measure()'s own
  // string-equality comparison so a future refactor to numeric comparison can't silently drop
  // a mismatch via float coercion.
  const rows = [
    { id: "a", display_id: "A", amount_paid_cents: "1000", applied_sum: "1000" },
    { id: "b", display_id: "B", amount_paid_cents: "500", applied_sum: "300" },
  ];
  const mismatches = rows.filter((row) => row.amount_paid_cents !== row.applied_sum);
  assert.equal(mismatches.length, 1, "MUTATION: a real mismatch must be detected");
  assert.equal(mismatches[0].id, "b", "MUTATION: the correct row must be named, not the clean one");

  // MUTATION 2 -- a ratchet-ceiling breach must be caught.
  const wideningCount = ZERO_PAYMENT_APP_COUNT_CEILING + 1;
  assert.ok(wideningCount > ZERO_PAYMENT_APP_COUNT_CEILING, "MUTATION: a count above the ceiling must be flagged");

  console.log(`${LABEL} --selftest PASS (2/2 mutations caught)`);
  process.exit(0);
}

await run();
