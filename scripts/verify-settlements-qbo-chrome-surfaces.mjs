#!/usr/bin/env node
/**
 * Settlements qbo_chrome — leaf-specific Built for surfaces that already use
 * QBO chrome (ParityTable / MoneyInput / DatePicker / EntityPicker / PaymentMethodPicker).
 * HONEST-BUILT-LAUNCH-LAW: no leafRe:".*" / word-blanket |settlements|; only leaves with
 * required qbo_chrome + real asserts below.
 *
 * @matrix-built {"modules":["settlements"],"cols":["qbo_chrome"],"leafRe":"^cash_advances$","task":"VERTICAL-QBO-CHROME-settlements-cash-advances","vertical":"column-wave"}
 * @matrix-built {"modules":["settlements"],"cols":["qbo_chrome"],"leafRe":"^settlement_close$","task":"VERTICAL-QBO-CHROME-settlements-close","vertical":"column-wave"}
 * @matrix-built {"modules":["settlements"],"cols":["qbo_chrome"],"leafRe":"^settlements\\.panel\\.open_driver_bills$","task":"VERTICAL-QBO-CHROME-settlements-open-bills","vertical":"column-wave"}
 * @matrix-built {"modules":["settlements"],"cols":["qbo_chrome"],"leafRe":"^chrome\\.toolbar_filter$","task":"VERTICAL-QBO-CHROME-settlements-toolbar-filter","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-settlements-qbo-chrome-surfaces.mjs --selftest
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlements-qbo-chrome-surfaces";

const CHECKS = [
  {
    name: "CashAdvanceRequestsPage +Create + EntityPicker filter + MoneyInput",
    file: "apps/frontend/src/pages/driver-finance/CashAdvanceRequestsPage.tsx",
    pattern:
      /\+ Create[\s\S]*dataTestId="cash-advance-requests-filter-driver"[\s\S]*MoneyInput[\s\S]*ariaLabel="Cash advance amount"/,
  },
  {
    name: "SettlementCloseArrivalPage PaymentMethodPicker + CreateDriverModal",
    file: "apps/frontend/src/pages/driver-finance/SettlementCloseArrivalPage.tsx",
    pattern: /PaymentMethodPicker[\s\S]*CreateDriverModal|CreateDriverModal[\s\S]*PaymentMethodPicker/,
  },
  {
    name: "SettlementCloseArrivalPage + Create driver affordance",
    file: "apps/frontend/src/pages/driver-finance/SettlementCloseArrivalPage.tsx",
    pattern: /\+ Create driver/,
  },
  {
    // ACCT-F5444: NOT kind="bill" — that was this check's original ask, and it is WRONG.
    // driver_finance.driver_bills is a different table from accounting.bills; kind="bill" drills
    // to /accounting/bills/:id, which live-404s for a driver_finance.driver_bills row (real repro,
    // verify-load-detail-driver-pay-bills.mjs's own comment: B-20260810-0003 -> 31f155f3-...).
    // These are OPEN (unsettled) bills — no settlement exists yet to reverse-link to either — so
    // driver + load are the only legitimate drills; the bill number itself stays honest plain text.
    //
    // Re-anchored (found live, 2026-09-01): OpenDriverBillsPanel was refactored to a DataTable +
    // openDriverBillColumns config (the EntityLink drills now live in the columns array, which is
    // defined ABOVE `function OpenDriverBillsPanel` in the file) — a legitimate change that left
    // the guard's driver/load JSX still fully correct, just textually before the old anchor instead
    // of after it, so `function OpenDriverBillsPanel[\s\S]*kind="driver"` could never match again.
    // Anchoring on `openDriverBillColumns` instead covers both the columns array and the panel
    // function (columns is always defined immediately before the panel that renders it).
    name: "SettlementsPage OpenDriverBillsPanel EntityLink drill (driver/load, never bill)",
    file: "apps/frontend/src/pages/driver-finance/SettlementsPage.tsx",
    pattern: /openDriverBillColumns[\s\S]*kind="driver"[\s\S]*kind="load"/,
    forbiddenNear: {
      // Forbid a REAL JSX kind="bill" prop near this function — not a prose mention of it in a
      // comment (which is exactly why this check exists and cites the live repro). Fixed-width
      // window, not a "match to closing brace" regex: OpenDriverBillsPanel's own destructured
      // props parameter list has its own `\n}` well before the function body even starts, so a
      // lazy [\s\S]*?\n} stops there instead of reaching the real body (found live: matched only
      // 86 chars, the props list, never the JSX). Window covers openDriverBillColumns (~1540
      // chars) through the end of OpenDriverBillsPanel (~2426 chars total, measured live) with
      // margin — wide enough for both blocks, not so wide it reaches unrelated later code.
      pattern: /openDriverBillColumns[\s\S]{0,2600}/,
      forbid: /<EntityLink[\s\S]{0,200}?kind\s*=\s*["']bill["']/,
      message: 'must NOT EntityLink kind="bill" in OpenDriverBillsPanel — driver_finance.driver_bills has no /accounting/bills/:id row, this 404s live',
    },
  },
  {
    name: "SettlementsTable ParityTable storageKey (gear/column chrome)",
    file: "apps/frontend/src/pages/driver-finance/components/SettlementsTable.tsx",
    pattern: /ParityTable[\s\S]*storageKey="driver-finance-settlements-list"/,
  },
  {
    name: "SettlementsPage EntityPicker driver filter (allowCreate=false)",
    file: "apps/frontend/src/pages/driver-finance/SettlementsPage.tsx",
    pattern:
      /kind="driver"[\s\S]*allowCreate=\{false\}[\s\S]*dataTestId="settlements-filter-driver"/,
  },
  {
    name: "HoldDeductionModal DatePicker",
    file: "apps/frontend/src/pages/driver-finance/components/HoldDeductionModal.tsx",
    pattern: /DatePicker/,
  },
  {
    name: "SettlementDetailPage MoneyInput",
    file: "apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx",
    pattern: /MoneyInput/,
  },
  {
    name: "SettlementDisputesTab MoneyInput",
    file: "apps/frontend/src/pages/driver-finance/components/SettlementDisputesTab.tsx",
    pattern: /MoneyInput/,
  },
  {
    name: "chrome.toolbar_filter: SettlementsPage CollapsedListFilters payment_state Apply triad",
    file: "apps/frontend/src/pages/driver-finance/SettlementsPage.tsx",
    pattern:
      /CollapsedListFilters[\s\S]*onApply=\{staged\.apply\}[\s\S]*onReset=\{staged\.reset\}[\s\S]*onCancel=\{staged\.cancel\}[\s\S]*testIdPrefix="settlements"/,
  },
];

function runChecks(root = ROOT) {
  const fails = [];
  for (const c of CHECKS) {
    const abs = path.join(root, c.file);
    if (!fs.existsSync(abs)) {
      fails.push(`${c.name}: missing ${c.file}`);
      continue;
    }
    const src = fs.readFileSync(abs, "utf8");
    if (!c.pattern.test(src)) fails.push(`${c.name}: pattern miss in ${c.file}`);
    if (c.forbiddenNear) {
      const scope = c.forbiddenNear.pattern.exec(src)?.[0] ?? src;
      if (c.forbiddenNear.forbid.test(scope)) {
        fails.push(`${c.name}: ${c.forbiddenNear.message}`);
      }
    }
  }
  return fails;
}

function selftest() {
  const live = runChecks();
  // GUARD-SELFTEST-LEAVES-UNTRACKED-DROPPINGS — this used to mkdtempSync inside the tracked
  // scripts/ tree; a killed/interrupted run left `scripts/.settlements-qbo-chrome-selftest-<rand>/`
  // as untracked git-status noise on every contributor's next commit (found live during a push
  // retry, same root-cause class as GUARD-SELFTEST-MUTATES-SOURCE — a selftest fixture belongs in
  // the real OS temp dir, never under the repo root, whether or not it's a tracked path).
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "settlements-qbo-chrome-selftest-"));
  try {
    for (const c of CHECKS) {
      const abs = path.join(tmp, c.file);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, "// poison — no chrome\n");
    }
    const planted = runChecks(tmp);
    if (planted.length < CHECKS.length) {
      console.error(`${LABEL} SELFTEST FAIL — planted chrome misses not caught (${planted.length})`);
      process.exit(1);
    }
    console.log(`${LABEL} SELFTEST PASS (poison trips ${planted.length})`);

    // Dedicated proof for the forbiddenNear check: poisoning the whole file (above) trivially
    // satisfies "no kind=bill JSX present" too, so that alone never exercises this detection path.
    // Plant a REAL kind="bill" regression on the live SettlementsPage.tsx content specifically.
    const settlementsFile = "apps/frontend/src/pages/driver-finance/SettlementsPage.tsx";
    const liveSrc = fs.readFileSync(path.join(ROOT, settlementsFile), "utf8");
    const regressed = liveSrc.replace(/kind="load"/, 'kind="bill"');
    if (regressed === liveSrc) {
      console.error(`${LABEL} SELFTEST FAIL — kind="load" anchor not found, re-anchor mutation`);
      process.exit(1);
    }
    const regressedDir = path.join(tmp, "regressed");
    const regressedAbs = path.join(regressedDir, settlementsFile);
    fs.mkdirSync(path.dirname(regressedAbs), { recursive: true });
    fs.writeFileSync(regressedAbs, regressed);
    for (const c of CHECKS) {
      if (c.file === settlementsFile) continue;
      const abs = path.join(regressedDir, c.file);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.copyFileSync(path.join(ROOT, c.file), abs);
    }
    const caughtRegression = runChecks(regressedDir).some((f) => f.includes('kind="bill"'));
    if (!caughtRegression) {
      console.error(`${LABEL} SELFTEST FAIL — planted kind="bill" regression in OpenDriverBillsPanel not caught`);
      process.exit(1);
    }
    console.log(`${LABEL} SELFTEST PASS (kind="bill" regression detected)`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (live.length) {
    console.error(`${LABEL} FAIL live:\n- ${live.join("\n- ")}`);
    process.exit(1);
  }
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const fails = runChecks();
if (fails.length) {
  console.error(`${LABEL} FAIL (${fails.length}):\n- ${fails.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — ${CHECKS.length} settlements qbo_chrome leaf asserts`);
