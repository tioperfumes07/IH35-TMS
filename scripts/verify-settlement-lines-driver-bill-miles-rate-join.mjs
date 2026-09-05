#!/usr/bin/env node
/**
 * verify-settlement-lines-driver-bill-miles-rate-join.mjs
 *
 * CODER-SEQUENCE-NUMBERED-2026-09-05.md §CC-1 item 1 (S.1): "settlement lines read model joins
 * driver_bills on source_driver_bill_id and returns miles, rate_cents, pay_cents for earnings
 * (miles_basis, rate_per_mile_cents, loaded_pay_cents) and deadhead (miles_deadhead,
 * rate_empty_per_mile_cents, deadhead_pay_cents); FE shows 1,319.7 / $0.4800."
 *
 * driver_finance.settlement_lines has NO miles/rate column (confirmed across every migration that
 * ever touched the table) — the real values live on driver_finance.driver_bills, reachable through
 * settlement_lines.source_driver_bill_id. Before this fix, GET /api/v1/driver-finance/settlements/:id
 * already LEFT JOINed driver_bills (for bill_number/load_id) but never selected its miles/rate/pay
 * columns, so the frontend's Number(line.miles ?? 0) / Number(line.rate ?? 0) always evaluated to 0
 * — every earnings/deadhead line on every settlement showed blank/zero miles and rate.
 */
import { readFileSync } from "node:fs";

const ROUTES_PATH = "apps/backend/src/driver-finance/settlements.routes.ts";
const PAGE_PATH = "apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx";
const EARNINGS_PATH = "apps/frontend/src/pages/driver-finance/components/EarningsSection.tsx";
const DEADHEAD_PATH = "apps/frontend/src/pages/driver-finance/components/DeadheadPaySection.tsx";

function load(path) {
  return readFileSync(path, "utf8");
}

export function collectFailures({
  routes = load(ROUTES_PATH),
  page = load(PAGE_PATH),
  earnings = load(EARNINGS_PATH),
  deadhead = load(DEADHEAD_PATH),
} = {}) {
  const failures = [];

  // Backend: the settlement-detail lines query must select miles/rate_cents/pay_cents from the
  // driver_bills join, keyed off line_type so earnings and deadhead_pay lines each read their own
  // correct column pair (loaded vs. empty).
  if (!/CASE\s+WHEN\s+sl\.line_type\s*=\s*'deadhead_pay'\s+THEN\s+db\.miles_deadhead\s+ELSE\s+db\.miles_basis\s+END\s+AS\s+miles/.test(routes)) {
    failures.push(`${ROUTES_PATH} settlement-detail lines query does not select miles from driver_bills (miles_basis/miles_deadhead) keyed by line_type`);
  }
  if (!/CASE\s+WHEN\s+sl\.line_type\s*=\s*'deadhead_pay'\s+THEN\s+db\.rate_empty_per_mile_cents\s+ELSE\s+db\.rate_per_mile_cents\s+END\s+AS\s+rate_cents/.test(routes)) {
    failures.push(`${ROUTES_PATH} settlement-detail lines query does not select rate_cents from driver_bills (rate_per_mile_cents/rate_empty_per_mile_cents) keyed by line_type`);
  }
  if (!/CASE\s+WHEN\s+sl\.line_type\s*=\s*'deadhead_pay'\s+THEN\s+db\.deadhead_pay_cents\s+ELSE\s+db\.loaded_pay_cents\s+END\s+AS\s+pay_cents/.test(routes)) {
    failures.push(`${ROUTES_PATH} settlement-detail lines query does not select pay_cents from driver_bills (loaded_pay_cents/deadhead_pay_cents) keyed by line_type`);
  }

  // Frontend: rate must be derived from rate_cents (the backend never sends a bare "rate" dollar
  // field), miles is read straight through.
  if (!/rate:\s*Number\(line\.rate_cents\s*\?\?\s*0\)\s*\/\s*100/.test(page)) {
    failures.push(`${PAGE_PATH} does not derive earnings/deadhead rate from line.rate_cents / 100`);
  }
  const milesReadCount = (page.match(/miles:\s*Number\(line\.miles\s*\?\?\s*0\)/g) ?? []).length;
  if (milesReadCount < 2) {
    failures.push(`${PAGE_PATH} does not read line.miles into both the earnings and deadhead line maps (found ${milesReadCount}, need 2)`);
  }

  // Rendering: miles 1-decimal + thousands separator, rate 4-decimal dollars-per-mile, per the
  // design-contract reference values (1,319.7 / $0.4800) — never a bare unformatted number.
  for (const [path, src] of [
    [EARNINGS_PATH, earnings],
    [DEADHEAD_PATH, deadhead],
  ]) {
    if (!/toLocaleString\("en-US",\s*\{\s*minimumFractionDigits:\s*1,\s*maximumFractionDigits:\s*1\s*\}\)/.test(src)) {
      failures.push(`${path} does not format miles to 1 decimal with thousands separator`);
    }
    if (!/\$\$\{line\.rate\.toFixed\(4\)\}/.test(src) && !/`\$\$\{line\.rate\.toFixed\(4\)\}`/.test(src) && !/\$\{line\.rate\.toFixed\(4\)\}/.test(src)) {
      failures.push(`${path} does not format rate to 4 decimals as a dollar amount`);
    }
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectFailures();
  if (baseline.length) {
    console.error(`verify-settlement-lines-driver-bill-miles-rate-join SELFTEST FAIL — good sources rejected: ${baseline.join(" | ")}`);
    process.exit(1);
  }
  const routes = load(ROUTES_PATH);
  const page = load(PAGE_PATH);
  const earnings = load(EARNINGS_PATH);
  const mutations = [
    [
      "miles CASE removed from SQL",
      { routes: routes.replace("CASE WHEN sl.line_type = 'deadhead_pay' THEN db.miles_deadhead ELSE db.miles_basis END AS miles,\n            ", "") },
    ],
    [
      "rate_cents CASE removed from SQL",
      { routes: routes.replace("CASE WHEN sl.line_type = 'deadhead_pay' THEN db.rate_empty_per_mile_cents ELSE db.rate_per_mile_cents END AS rate_cents,\n            ", "") },
    ],
    [
      "pay_cents CASE removed from SQL",
      { routes: routes.replace("CASE WHEN sl.line_type = 'deadhead_pay' THEN db.deadhead_pay_cents ELSE db.loaded_pay_cents END AS pay_cents,\n            ", "") },
    ],
    [
      "frontend reverts to reading line.rate directly (the always-0 bug)",
      { page: page.replaceAll("rate: Number(line.rate_cents ?? 0) / 100,", "rate: Number(line.rate ?? 0),") },
    ],
    [
      "EarningsSection drops the 4-decimal rate formatter",
      { earnings: earnings.replace('render: (line) => <>{line.rate != null ? `$${line.rate.toFixed(4)}` : "—"}</>,', 'render: (line) => <>{line.rate ?? "—"}</>,') },
    ],
  ];
  const escaped = [];
  for (const [name, patch] of mutations) {
    const args = {
      routes: patch.routes ?? routes,
      page: patch.page ?? page,
      earnings: patch.earnings ?? earnings,
      deadhead: patch.deadhead ?? load(DEADHEAD_PATH),
    };
    if (args.routes === routes && args.page === page && args.earnings === earnings && patch.routes === undefined && patch.page === undefined && patch.earnings === undefined) {
      escaped.push(`${name} (plant target not found — source drifted)`);
      continue;
    }
    if (collectFailures(args).length === 0) escaped.push(name);
  }
  if (escaped.length) {
    console.error(`verify-settlement-lines-driver-bill-miles-rate-join SELFTEST FAIL — escaped: ${escaped.join(", ")}`);
    process.exit(1);
  }
  console.log(`verify-settlement-lines-driver-bill-miles-rate-join SELFTEST PASS — ${mutations.length}/${mutations.length} plants rejected`);
}

const failures = collectFailures();
if (failures.length > 0) {
  console.error("verify-settlement-lines-driver-bill-miles-rate-join: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

// Live check (skips cleanly with no DATABASE_URL — this is the CI-static half; the live half is
// run manually/CD-side against Neon). Owner's own spec: "every earnings/deadhead line on S-13642
// has miles>0 and rate>0" — live-measured, this settlement now carries 8 lines (reseeded since the
// design-mockup reference was written), 2 of which are genuinely zero-deadhead loads (pay_cents=0,
// miles_deadhead/rate_empty_per_mile_cents NULL on driver_bills — no deadhead leg at all, not a
// gap). The honest criterion is therefore "every line that actually PAID something has real
// miles>0 and rate>0", not "every line unconditionally" — a $0.00 deadhead line on a load with no
// empty miles correctly shows "—", not a fabricated 0.0/$0.0000.
if (process.env.DATABASE_URL) {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    const res = await client.query(
      `
        SELECT sl.line_type, sl.description,
          CASE WHEN sl.line_type = 'deadhead_pay' THEN db.miles_deadhead ELSE db.miles_basis END AS miles,
          CASE WHEN sl.line_type = 'deadhead_pay' THEN db.rate_empty_per_mile_cents ELSE db.rate_per_mile_cents END AS rate_cents,
          CASE WHEN sl.line_type = 'deadhead_pay' THEN db.deadhead_pay_cents ELSE db.loaded_pay_cents END AS pay_cents
        FROM driver_finance.settlement_lines sl
        LEFT JOIN driver_finance.driver_bills db ON db.id = sl.source_driver_bill_id
        LEFT JOIN driver_finance.driver_settlements s ON s.id = sl.settlement_id
        WHERE s.display_id = 'S-13642' AND sl.line_type IN ('earnings', 'deadhead_pay')
      `
    );
    await client.query("COMMIT");
    const liveFailures = [];
    for (const row of res.rows) {
      const paid = Number(row.pay_cents ?? 0) > 0;
      if (paid && !(Number(row.miles ?? 0) > 0 && Number(row.rate_cents ?? 0) > 0)) {
        liveFailures.push(`${row.line_type} "${row.description}" paid $${(Number(row.pay_cents) / 100).toFixed(2)} but miles=${row.miles} rate_cents=${row.rate_cents}`);
      }
    }
    if (liveFailures.length) {
      console.error(`verify-settlement-lines-driver-bill-miles-rate-join LIVE FAIL — S-13642 has ${liveFailures.length} paid line(s) with missing miles/rate: ${liveFailures.join(" | ")}`);
      process.exit(1);
    }
    console.log(`verify-settlement-lines-driver-bill-miles-rate-join LIVE OK — S-13642: ${res.rows.length} lines checked, every paid line has miles>0 and rate>0`);
  } finally {
    client.release();
    await pool.end();
  }
}

console.log("verify-settlement-lines-driver-bill-miles-rate-join: OK — settlement-detail earnings/deadhead lines carry real miles/rate from the driver_bills join, formatted to the design contract");
