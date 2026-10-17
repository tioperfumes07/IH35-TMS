#!/usr/bin/env node
/**
 * CASH-FLOW-OVERVIEW-FAKE-ZERO-ON-QUERY-FAILURE
 *
 * Root cause: `GET /api/v1/reports/cash-flow-overview` (apps/backend/src/reports/cash-flow-overview.routes.ts)
 * had 7 separate `.catch(() => ({ rows: [{ ...: "0" }] }))` fallbacks — one per query feeding the
 * cash-position dashboard (bank balances, factoring summary, uncategorized-txn count, expected
 * AR/AP/settlement outflows, 7d/30d historical inflow+outflow). A schema drift, RLS
 * misconfiguration, or any transient failure on ANY of these silently rendered as an authoritative
 * $0 across the whole dashboard instead of surfacing an error — the exact class already root-caused
 * for fuel MTD spend (FUEL-PLANNER-DASHBOARD-SPEND-QUERY-FAILS-AS-ZERO,
 * verify-fuel-home-dashboard-wired.mjs), just 7x the blast radius on a page the owner actively
 * reads for real cash decisions. The frontend (CashFlowOverviewPage.tsx) already renders
 * `query.isError` via ReportBlockTPendingBanner with a retry button — removing the fake fallback
 * makes a real failure surface honestly instead of needing a new UI path.
 *
 * The bank-hide flag read: originally carved out as `.catch(() => false)`; superseded by 2570e4f8ae
 * (#16316) — a failed flag read must fail loud, so the guard now requires the plain awaited read and
 * flags any catch on it.
 *
 * Usage:
 *   node scripts/verify-cash-flow-overview-no-fake-zero.mjs            # scan
 *   node scripts/verify-cash-flow-overview-no-fake-zero.mjs --selftest # regression harness
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/backend/src/reports/cash-flow-overview.routes.ts";
const LABEL = "verify-cash-flow-overview-no-fake-zero";

const FAKE_ZERO_CATCH_RE = /\.catch\(\(\)\s*=>\s*\(\{\s*rows:\s*\[\{[^}]*:\s*["']0["']/;
// 443.187 repoint — the bank-hide flag read was deliberately made to FAIL LOUD by 2570e4f8ae
// (BANK-ACCOUNT-HIDE-CAPABILITY-FAILURE-FAILS-OPEN, #16316): `.catch(() => false)` treated a FAILED read as "hide is off" and
// let hidden accounts back into the totals. Same intent as the original carve-out (keep the flag read; never invent a value):
// the read must be present AND must not swallow its failure.
const FLAG_READ_RE = /await\s+isBankAccountHideEnabled\(\s*client\s*,\s*companyId\s*\)/;
const FLAG_SWALLOW_RE = /isBankAccountHideEnabled\([^)]*\)\.catch\(/;

/** Strip `//` line comments so a mention only in prose can't false-positive. */
function stripLineComments(src) {
  return src
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("//");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");
}

export function checkNoFakeZeroCatch(src) {
  const offenders = [];
  const code = stripLineComments(src);
  if (FAKE_ZERO_CATCH_RE.test(code)) {
    offenders.push(
      `${FILE}: a .catch(() => ({ rows: [{ ...: "0" }] })) fake-zero fallback was reintroduced — ` +
        `a real query failure must surface as query.isError (ReportBlockTPendingBanner already handles it), not an authoritative fake $0.`,
    );
  }
  if (!FLAG_READ_RE.test(code)) {
    offenders.push(`${FILE}: the bank-account hide flag read (await isBankAccountHideEnabled(client, companyId)) is missing — the totals must honour hidden accounts.`);
  }
  if (FLAG_SWALLOW_RE.test(code)) {
    offenders.push(`${FILE}: isBankAccountHideEnabled(...).catch(...) swallows a failed flag read — a failure must fail the request, never read as "hide is off" (2570e4f8ae).`);
  }
  return offenders;
}

function main() {
  const selftest = process.argv.includes("--selftest");

  if (selftest) {
    const clean = `
      const bankRes = await client.query(sql, [companyId]);
      const hideOn = await isBankAccountHideEnabled(client, companyId);
    `;
    const swallowed = `
      const bankRes = await client.query(sql, [companyId]);
      const hideOn = await isBankAccountHideEnabled(client, companyId).catch(() => false);
    `;
    const bugged = `
      const bankRes = await client.query(sql, [companyId]).catch(() => ({ rows: [{ payroll_cents: "0", dip_cents: "0" }] }));
      const hideOn = await isBankAccountHideEnabled(client, companyId);
    `;
    const flagRemoved = `
      const bankRes = await client.query(sql, [companyId]);
    `;
    const cleanOffenders = checkNoFakeZeroCatch(clean);
    if (cleanOffenders.length !== 0) {
      console.error(`${LABEL} SELFTEST FAIL — clean fixture flagged:`, cleanOffenders);
      process.exit(1);
    }
    const buggedOffenders = checkNoFakeZeroCatch(bugged);
    if (buggedOffenders.length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — bugged fixture (fake-zero catch) NOT flagged`);
      process.exit(1);
    }
    if (checkNoFakeZeroCatch(swallowed).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — a swallowed flag read (.catch(() => false)) NOT flagged`);
      process.exit(1);
    }
    const flagRemovedOffenders = checkNoFakeZeroCatch(flagRemoved);
    if (flagRemovedOffenders.length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — missing flag read NOT flagged`);
      process.exit(1);
    }
    console.log(`${LABEL} --selftest PASS`);
    process.exit(0);
  }

  const abs = path.join(ROOT, FILE);
  if (!fs.existsSync(abs)) {
    console.error(`${LABEL} FAIL\n  - ${FILE}: file not found`);
    process.exit(1);
  }
  const offenders = checkNoFakeZeroCatch(fs.readFileSync(abs, "utf8"));
  if (offenders.length > 0) {
    console.error(`${LABEL} FAILED:`);
    for (const o of offenders) console.error(`  ✗ ${o}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASSED — no fake-zero query fallback on the cash-flow overview money queries`);
  process.exit(0);
}

main();
