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
 *
 * Self-test: node scripts/verify-settlements-qbo-chrome-surfaces.mjs --selftest
 */
import fs from "node:fs";
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
    name: "SettlementsPage OpenDriverBillsPanel EntityLink drill (driver/load/bill)",
    file: "apps/frontend/src/pages/driver-finance/SettlementsPage.tsx",
    pattern:
      /function OpenDriverBillsPanel[\s\S]*kind="driver"[\s\S]*kind="load"[\s\S]*kind="bill"/,
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
  }
  return fails;
}

function selftest() {
  const live = runChecks();
  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".settlements-qbo-chrome-selftest-"));
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
