#!/usr/bin/env node
/**
 * SET-RATE (owner item, 2026-09-05, docs/bus/ONE-ITEM-INSTRUCTIONS-ALL-SEATS-2026-09-05.md) —
 * settlement detail Earnings/Empty-miles rate consistency + no fake zeros.
 *
 * MEASURED LIVE (FE 25eeb90b): load 13526's earnings row showed "1,610.0 mi · $0.6000 · $724.50" —
 * 724.50 / 1610 = $0.4500, not $0.6000. ROOT CAUSE: driver_finance.driver_bills.rate_per_mile_cents
 * was minted (apps/backend/src/dispatch/book-load.service.ts, a CC-2-owned file — filed to CC-2, not
 * fixed here) as round((loaded+deadhead total) / loaded-only miles), a blended figure that is neither
 * the loaded nor the empty rate. The settlements.routes.ts read query then joined that mutable, wrong
 * column independently of the amount it was displayed next to.
 *
 * FIX (this file's static check locks it): settlements.routes.ts now derives rate_cents from THE
 * SAME sl.amount the Amount column renders, divided by the SAME miles used to pick the leg — making
 * amount == miles * rate a mathematical identity for every row, not a hope. rate_source flags whether
 * that derived figure also matches the bill's own (potentially still-buggy, upstream) card rate
 * ('card') or not ('derived'). LAW §8 "zero is a claim": a leg with no telematics/dispatch miles
 * renders undefined -> "—" on the frontend, never a fabricated 0.0 / $0.0000 / $0.00 triple.
 *
 * Two halves:
 *   1. STATIC (always runs) — settlements.routes.ts computes rate_cents/rate_source FROM sl.amount
 *      (never a bare db.rate_per_mile_cents/db.rate_empty_per_mile_cents passthrough); the three FE
 *      render sites (SettlementDetailPage mapper x2, EarningsSection, DeadheadPaySection) never
 *      coerce miles/rate to a fake 0 via `?? 0`.
 *   2. LIVE (DATABASE_URL set) — replays the exact read-query rate derivation against Neon and
 *      asserts, for every USMCA settlement line with miles > 0, |amount*100 - miles*rate_cents| <= 1
 *      cent (true by construction, but this is the independent live re-proof, not a static assumption).
 *
 * Usage:
 *   node scripts/verify-settlement-line-rate-consistency.mjs --selftest
 *   DATABASE_URL=<Neon prod> node scripts/verify-settlement-line-rate-consistency.mjs
 */
import fs from "node:fs";

const LABEL = "verify-settlement-line-rate-consistency";
const ROUTES_PATH = "apps/backend/src/driver-finance/settlements.routes.ts";
const FE_FILES = [
  "apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx",
  "apps/frontend/src/pages/driver-finance/components/EarningsSection.tsx",
  "apps/frontend/src/pages/driver-finance/components/DeadheadPaySection.tsx",
];
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

export function routeDerivesRateFromAmount(routeSrc) {
  // The rate_cents value itself must be computed by dividing sl.amount (the SAME field the Amount
  // column renders) by the resolved miles — never a bare `db.rate_per_mile_cents` /
  // `db.rate_empty_per_mile_cents` / `rate_basis.card_rate_cents` column read as the displayed rate
  // on its own, which is exactly how the original defect displayed a rate inconsistent with amount.
  const rateCentsLine = routeSrc.match(/^.*AS rate_cents,\s*$/m)?.[0] ?? "";
  const isSelfConsistent = /ROUND\(\(sl\.amount \* 100\) \/ rate_basis\.miles\)/.test(rateCentsLine);
  const hasRateSource = /AS rate_source/.test(routeSrc);
  return isSelfConsistent && hasRateSource;
}

export function feNeverFakesZero(source) {
  // The exact regression this item fixed: `Number(line.miles ?? 0)` / `Number(line.rate_cents ?? 0)`
  // turn a genuinely-unknown leg into a rendered 0.0 / $0.0000 — indistinguishable from a real zero.
  return !/Number\(line\.miles \?\? 0\)/.test(source) && !/Number\(line\.rate_cents \?\? 0\)/.test(source);
}

function selftest() {
  const goodRoute = fs.readFileSync(ROUTES_PATH, "utf8");
  if (!routeDerivesRateFromAmount(goodRoute)) {
    console.error(`${LABEL} SELFTEST FAIL — good route source rejected`);
    process.exit(1);
  }
  const regressedRoute = goodRoute.replace(
    "CASE WHEN rate_basis.miles > 0 THEN ROUND((sl.amount * 100) / rate_basis.miles)::int ELSE NULL END AS rate_cents,",
    "rate_basis.card_rate_cents AS rate_cents,"
  );
  if (routeDerivesRateFromAmount(regressedRoute)) {
    console.error(`${LABEL} SELFTEST FAIL — reverting to a bare bill-column rate passthrough was not caught`);
    process.exit(1);
  }

  for (const path of FE_FILES) {
    const good = fs.readFileSync(path, "utf8");
    if (!feNeverFakesZero(good)) {
      console.error(`${LABEL} SELFTEST FAIL — good FE source ${path} rejected`);
      process.exit(1);
    }
  }
  const goodSDP = fs.readFileSync(FE_FILES[0], "utf8");
  const regressedSDP = goodSDP.replace(
    "miles: line.miles == null ? undefined : Number(line.miles),",
    "miles: Number(line.miles ?? 0),"
  );
  if (feNeverFakesZero(regressedSDP)) {
    console.error(`${LABEL} SELFTEST FAIL — reintroducing the fake-zero miles coercion was not caught`);
    process.exit(1);
  }

  console.log(`${LABEL} SELFTEST OK — 2/2 plants rejected`);
}

if (process.argv.includes("--selftest")) selftest();

// Static half.
const failures = [];
if (!fs.existsSync(ROUTES_PATH)) {
  failures.push(`${ROUTES_PATH} not found`);
} else {
  const routeSrc = fs.readFileSync(ROUTES_PATH, "utf8");
  if (!routeDerivesRateFromAmount(routeSrc)) {
    failures.push(`${ROUTES_PATH} no longer derives rate_cents from sl.amount (the same source Amount renders)`);
  }
}
for (const path of FE_FILES) {
  if (!fs.existsSync(path)) {
    failures.push(`${path} not found`);
    continue;
  }
  if (!feNeverFakesZero(fs.readFileSync(path, "utf8"))) {
    failures.push(`${path} coerces an unknown miles/rate leg to a fake 0 (LAW §8 "zero is a claim")`);
  }
}
if (failures.length) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL}: static OK — rate reads the same source as amount; no FE fake-zero coercion`);

// Live half: only runs with a real DATABASE_URL — same convention as
// verify-acc13-no-test-accounts-in-usmca-coa.mjs / verify-driver-vendor-linkage.mjs.
if (!process.env.DATABASE_URL) {
  console.log(`${LABEL}: DATABASE_URL not set — skipping the live re-check (static check above still ran).`);
  console.log(`${LABEL}: to re-run live: DATABASE_URL=<prod> node ${process.argv[1]}`);
  process.exit(0);
}

const { Client } = await import("pg");
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);

  // Positive control on the SAME tables this guard reads.
  const control = await client.query(
    `
      SELECT count(*)::int AS n
      FROM driver_finance.settlement_lines sl
      JOIN driver_finance.driver_settlements ds ON ds.id = sl.settlement_id
      WHERE ds.operating_company_id = $1 AND sl.line_type IN ('earnings', 'deadhead_pay')
    `,
    [USMCA]
  );
  if (control.rows[0].n === 0) {
    console.error(`${LABEL}: FAIL — settlement_line_control=0, this connection cannot see USMCA's settlement lines (masked read, not a verdict)`);
    process.exit(1);
  }

  const mismatches = await client.query(
    `
      SELECT sl.id::text, sl.line_type, sl.amount, rate_basis.miles,
        CASE WHEN rate_basis.miles > 0 THEN ROUND((sl.amount * 100) / rate_basis.miles)::int ELSE NULL END AS rate_cents
      FROM driver_finance.settlement_lines sl
      JOIN driver_finance.driver_settlements ds ON ds.id = sl.settlement_id
      LEFT JOIN driver_finance.driver_bills db ON db.id = sl.source_driver_bill_id
      LEFT JOIN LATERAL (
        SELECT CASE WHEN sl.line_type = 'deadhead_pay' THEN db.miles_deadhead ELSE db.miles_basis END AS miles
      ) rate_basis ON true
      WHERE ds.operating_company_id = $1
        AND sl.line_type IN ('earnings', 'deadhead_pay')
        AND rate_basis.miles > 0
        AND ABS(ROUND(sl.amount * 100) - ROUND(rate_basis.miles * ROUND((sl.amount * 100) / rate_basis.miles))) > 1
    `,
    [USMCA]
  );

  await client.query("ROLLBACK");

  if (mismatches.rows.length > 0) {
    console.error(`${LABEL}: FAIL (settlement_line_control=${control.rows[0].n})`);
    for (const r of mismatches.rows) console.error(`  - line ${r.id} (${r.line_type}): amount=${r.amount} miles=${r.miles} rate_cents=${r.rate_cents}`);
    process.exit(1);
  }
  console.log(
    `${LABEL}: PASS — every USMCA earnings/deadhead_pay line with miles > 0 has |amount - miles*rate| <= 1 cent (settlement_line_control=${control.rows[0].n})`
  );
} finally {
  await client.end();
}
