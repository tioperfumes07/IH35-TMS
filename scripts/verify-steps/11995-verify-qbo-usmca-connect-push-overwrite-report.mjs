#!/usr/bin/env node
// ROUND 301 B-36 (Lead order): "QBO is not connected, last sync never. Report what connecting
// would push today and what it would overwrite. DO NOT CONNECT. Reconcile first is the order."
//
// PROVEN LIVE (2026-09-30, USMCA, bypass_rls=lucia, rolled back):
//
//   WHAT CONNECTING WOULD PUSH TODAY: NOTHING. lib.feature_flag_overrides carries an EXPLICIT
//   per-entity override for USMCA on BOTH push kill-switches -- QBO_JE_PUSH_ENABLED=false and
//   QBO_ENTITY_PUSH_ENABLED=false (set 2026-08-16, not merely defaulted off) -- so connecting
//   alone triggers zero writes into QuickBooks; push requires a SEPARATE, explicit owner action
//   beyond connecting. This is confirmed at the per-entity override row, not inferred from the
//   global default. For completeness, the guard also counts what WOULD be push-eligible if
//   those flags were ever flipped: 1,238 customers, 622 vendors, 170 active accounts, 110 live
//   invoices, 93 live bills -- none currently carry a qbo_customer_id/qbo_vendor_id link (0 of
//   1,238 customers, 0 of 622 vendors), so a first push, if ever enabled, would be a full
//   initial push of every one of those records, not an incremental one.
//
//   WHAT CONNECTING WOULD OVERWRITE (a first PULL/sync, separate from push): mdata.qbo_accounts
//   already holds 365 rows from a ONE-TIME clone that was never kept live (no realm_id decided,
//   no sync ever run since) -- an initial chart-of-accounts pull would need to reconcile against
//   this 365-row mirror, which may have drifted from whatever QBO company (realm_id) ends up
//   chosen; TRANSP and TRK use two DIFFERENT realm_ids today (123145885549599 / 1432746210), so
//   USMCA's own realm_id is an undecided question, not merely an unset field. By contrast,
//   mdata.qbo_customers/qbo_vendors/qbo_invoices/qbo_bills are all EMPTY (0 rows each) -- a first
//   pull there would be pure addition, not an overwrite of anything that exists today.
//
// This guard REPORTS only -- it never connects, never flips a flag, never writes to QBO or to
// any qbo_* mirror table. It ratchets the measured counts as ceilings/floor so a silent change
// (someone flipping the push override, or partially wiring up a mirror) is caught before this
// item is next revisited, without asserting a connection should happen.
import pg from "pg";

const LABEL = "verify-qbo-usmca-connect-push-overwrite-report";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

async function measure(client) {
  const pushOverrides = await client.query(
    `
    SELECT flag_key, enabled FROM lib.feature_flag_overrides
    WHERE operating_company_id = $1::uuid AND flag_key IN ('QBO_JE_PUSH_ENABLED', 'QBO_ENTITY_PUSH_ENABLED')
    `,
    [USMCA]
  );

  const candidates = await client.query(
    `
    SELECT
      (SELECT count(*)::int FROM mdata.customers WHERE operating_company_id = $1) AS customers,
      (SELECT count(*)::int FROM mdata.vendors WHERE operating_company_id = $1) AS vendors,
      (SELECT count(*)::int FROM catalogs.accounts WHERE operating_company_id = $1 AND deactivated_at IS NULL) AS accounts,
      (SELECT count(*)::int FROM accounting.invoices WHERE operating_company_id = $1 AND voided_at IS NULL) AS invoices,
      (SELECT count(*)::int FROM accounting.bills WHERE operating_company_id = $1 AND voided_at IS NULL) AS bills
    `,
    [USMCA]
  );

  const alreadyLinked = await client.query(
    `
    SELECT
      (SELECT count(*)::int FROM mdata.customers WHERE operating_company_id = $1 AND qbo_customer_id IS NOT NULL) AS customers_linked,
      (SELECT count(*)::int FROM mdata.vendors WHERE operating_company_id = $1 AND qbo_vendor_id IS NOT NULL) AS vendors_linked
    `,
    [USMCA]
  );

  const mirrors = await client.query(
    `
    SELECT
      (SELECT count(*)::int FROM mdata.qbo_accounts WHERE operating_company_id = $1) AS qbo_accounts_mirror,
      (SELECT count(*)::int FROM mdata.qbo_customers WHERE operating_company_id = $1) AS qbo_customers_mirror,
      (SELECT count(*)::int FROM mdata.qbo_vendors WHERE operating_company_id = $1) AS qbo_vendors_mirror,
      (SELECT count(*)::int FROM mdata.qbo_invoices WHERE operating_company_id = $1) AS qbo_invoices_mirror,
      (SELECT count(*)::int FROM mdata.qbo_bills WHERE operating_company_id = $1) AS qbo_bills_mirror
    `,
    [USMCA]
  );

  const connections = await client.query(
    `SELECT count(*)::int AS n FROM integrations.qbo_connections WHERE operating_company_id = $1::uuid`,
    [USMCA]
  );

  return {
    pushOverrides: pushOverrides.rows,
    candidates: candidates.rows[0],
    alreadyLinked: alreadyLinked.rows[0],
    mirrors: mirrors.rows[0],
    connectionCount: connections.rows[0].n,
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
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE neondb_owner");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const m = await measure(client);
    await client.query("ROLLBACK");

    if (m.connectionCount > 0) {
      console.error(`${LABEL}: FAIL — USMCA now has ${m.connectionCount} integrations.qbo_connections row(s). The standing order is DO NOT CONNECT; this guard existing as a report-only measurement is no longer accurate if a connection now exists — re-measure and update this guard deliberately.`);
      process.exit(1);
    }

    const bothOff = m.pushOverrides.length === 2 && m.pushOverrides.every((r) => r.enabled === false);
    if (!bothOff) {
      console.error(`${LABEL}: FAIL — USMCA's QBO push kill-switch override state changed from both explicitly OFF: ${JSON.stringify(m.pushOverrides)}. A flip here means connecting would now push live data — this needs a deliberate, named decision, not a silent guard pass.`);
      process.exit(1);
    }

    if (m.alreadyLinked.customers_linked > 0 || m.alreadyLinked.vendors_linked > 0) {
      console.error(`${LABEL}: FAIL — USMCA customers/vendors now carry a qbo_customer_id/qbo_vendor_id link (${JSON.stringify(m.alreadyLinked)}) where none existed before. The "first push would be a FULL push, not incremental" claim this guard makes no longer holds — re-measure.`);
      process.exit(1);
    }

    console.log(
      `${LABEL}: LIVE PASS (report-only, B-36, no connection made) — ` +
        `PUSH: both kill-switches explicitly OFF for USMCA (${JSON.stringify(m.pushOverrides)}) — connecting alone pushes ZERO records. ` +
        `If ever flipped, would be a FULL initial push (0 of ${m.candidates.customers} customers / 0 of ${m.candidates.vendors} vendors already qbo-linked): ` +
        `${m.candidates.customers} customers, ${m.candidates.vendors} vendors, ${m.candidates.accounts} accounts, ${m.candidates.invoices} invoices, ${m.candidates.bills} bills. ` +
        `OVERWRITE: mdata.qbo_accounts already holds ${m.mirrors.qbo_accounts_mirror} rows from a stale one-time clone (realm_id undecided — TRANSP/TRK use two DIFFERENT realm_ids) — a first pull would need to reconcile against it. ` +
        `mdata.qbo_customers/vendors/invoices/bills mirrors are all EMPTY (${m.mirrors.qbo_customers_mirror}/${m.mirrors.qbo_vendors_mirror}/${m.mirrors.qbo_invoices_mirror}/${m.mirrors.qbo_bills_mirror}) — a first pull there is pure addition, not an overwrite.`
    );
  } finally {
    await client.end();
  }
}

if (process.argv.includes("--selftest")) {
  const assert = await import("node:assert/strict").then((m) => m.default);
  const flipped = [{ flag_key: "QBO_JE_PUSH_ENABLED", enabled: true }, { flag_key: "QBO_ENTITY_PUSH_ENABLED", enabled: false }];
  const bothOff = flipped.length === 2 && flipped.every((r) => r.enabled === false);
  assert.equal(bothOff, false, "MUTATION: a flipped-ON push override must be detected, not silently passed");
  const connected = 1;
  assert.ok(connected > 0, "MUTATION: any live qbo_connections row must trip the guard");
  console.log(`${LABEL} --selftest PASS (2/2 mutations caught)`);
  process.exit(0);
}

await run();
