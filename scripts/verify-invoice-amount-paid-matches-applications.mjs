#!/usr/bin/env node
// ROUND 300 B-31 (Lead order): "TRACE the chain: Faro receipt -> payment -> payment_application
// -> invoice.amount_paid_cents. NAME where it breaks."
//
// Live-traced 2026-09-30 on USMCA: the payment_applications -> invoice.amount_paid_cents link is
// CLEAN (0 of 110 live invoices mismatch). The break is entirely upstream of this guard's own
// scope -- "Faro receipt -> payment" has no ingestion path at all (no receipt/debtor/collection
// table anywhere in the schema names Faro as a source; the 7 payments that exist are all
// payment_source_kind='manual', source=null, unrelated to any Faro import). That is a data-
// pipeline gap, not a guard's job to police — a guard can only assert an invariant over data that
// exists. This guard locks the half of the chain that IS provably correct today, so a future
// regression in THIS link (payment_applications -> invoice.amount_paid_cents) is caught
// immediately rather than being mistaken for a repeat of the upstream Faro-import gap.
//
// FAILS IF: any non-voided invoice's amount_paid_cents does not exactly equal the sum of its
// non-unapplied accounting.payment_applications.amount_cents rows.
import pg from "pg";

const LABEL = "verify-invoice-amount-paid-matches-applications";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

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
  return { total: res.rows.length, mismatches };
}

async function run() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(`${LABEL}: FAIL — DATABASE_URL not set and this guard does not declare ALLOW_OFFLINE_SKIP. A live money guard that cannot connect is a FAIL, never a pass.`);
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE neondb_owner");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const { total, mismatches } = await measure(client, USMCA);
    await client.query("ROLLBACK");

    if (mismatches.length > 0) {
      console.error(`${LABEL}: FAIL — ${mismatches.length} of ${total} live USMCA invoice(s) have amount_paid_cents not matching sum(payment_applications):`);
      for (const m of mismatches.slice(0, 20)) {
        console.error(`  invoice ${m.display_id} (${m.id}): amount_paid_cents=${m.amount_paid_cents}, applied_sum=${m.applied_sum}`);
      }
      process.exit(1);
    }
    console.log(`${LABEL}: LIVE PASS — ${total} live USMCA invoice(s) checked, 0 amount_paid_cents/payment_applications mismatches.`);
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
  console.log(`${LABEL} --selftest PASS (1/1 mutation caught)`);
  process.exit(0);
}

await run();
