#!/usr/bin/env node
/**
 * Block A24-5: DriverDetail Earnings & Debt tab live wiring.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.VERIFY_DRIVERS_EARNINGS_DEBT_ROOT ?? process.cwd();

const paths = {
  earningsTab: path.join(ROOT, "apps/frontend/src/components/drivers/EarningsTab.tsx"),
  earningsTest: path.join(ROOT, "apps/frontend/src/components/drivers/__tests__/EarningsTab.test.tsx"),
  driverDetail: path.join(ROOT, "apps/frontend/src/pages/DriverDetail.tsx"),
};

function read(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function main() {
  const failures = [];
  const earningsTab = read(paths.earningsTab);
  const earningsTest = read(paths.earningsTest);
  const driverDetail = read(paths.driverDetail);

  if (!earningsTab.includes("export function EarningsTab")) {
    failures.push("EarningsTab.tsx must export EarningsTab");
  }
  if (!earningsTab.includes('data-testid="driver-earnings-debt-tab"')) {
    failures.push("EarningsTab.tsx must expose driver-earnings-debt-tab test id");
  }
  if (!earningsTab.includes("getDebtSummary") && !earningsTab.includes("useLiveDebt")) {
    failures.push("EarningsTab.tsx must trigger live debt recompute");
  }
  if (!earningsTab.includes("getLiabilitiesByDriver")) {
    failures.push("EarningsTab.tsx must load liabilities by driver");
  }
  if (!earningsTab.includes("listSettlements")) {
    failures.push("EarningsTab.tsx must load settlements summary");
  }
  if (!earningsTab.includes("/driver-finance/settlements?driver_id=")) {
    failures.push("EarningsTab.tsx must link to canonical settlements page");
  }
  if (!earningsTab.includes("driver-earnings-debt-refresh")) {
    failures.push("EarningsTab.tsx must expose refresh control");
  }
  if (!earningsTab.includes("ARCHIVE (A24-5)")) {
    failures.push("EarningsTab.tsx must archive prior placeholder with ARCHIVE (A24-5) comment");
  }

  if (!driverDetail.includes("<EarningsTab")) {
    failures.push("DriverDetail.tsx must render EarningsTab on Earnings & Debt tab");
  }
  if (driverDetail.includes("coming in a subsequent phase")) {
    failures.push("DriverDetail.tsx must not retain earnings placeholder copy");
  }

  const testCount = (earningsTest.match(/\bit\s*\(/g) ?? []).length;
  if (testCount < 3) {
    failures.push("EarningsTab.test.tsx must include at least 3 vitest cases");
  }

  if (failures.length > 0) {
    console.error("verify:drivers-earnings-debt-tab FAILED");
    for (const failure of failures) console.error(` - ${failure}`);
    process.exit(1);
  }

  console.log("verify:drivers-earnings-debt-tab OK");
}

main();
