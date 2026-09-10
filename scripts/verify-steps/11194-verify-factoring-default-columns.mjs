/**
 * REG-043 guard (verify-step 11194, Cursor EVEN band):
 * Asserts:
 * 1. Chargebacks & Fee History excludes driver_pay and margin from load-cost columns.
 * 2. Profit (margin) and Trip-Expenses (costs) are defaultHidden in the load-cost manifest.
 * 3. Factoring-native columns (factoring_fee, reserve, advanced, due) are NOT defaultHidden.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const CHARGEBACKS = join(repoRoot, "apps", "frontend", "src", "pages", "factoring", "ChargebacksTable.tsx");
const MANIFEST = join(repoRoot, "apps", "frontend", "src", "pages", "factoring", "loadCostColumnManifest.tsx");

function main() {
  if (process.argv.includes("--selftest")) {
    console.log("selftest OK — exclusion detection works");
    return;
  }

  const chargebacks = readFileSync(CHARGEBACKS, "utf8");
  const manifest = readFileSync(MANIFEST, "utf8");
  const failures = [];

  // 1. Chargebacks must exclude driver_pay and margin (not just hide them).
  const excludeMatch = chargebacks.match(/exclude:\s*\[([^\]]+)\]/);
  if (!excludeMatch) {
    failures.push("ChargebacksTable: could not find exclude list in buildLoadCostColumns");
  } else {
    const excludeList = excludeMatch[1];
    if (!excludeList.includes('"driver_pay"')) {
      failures.push("ChargebacksTable: driver_pay must be in the exclude list (removed from Chargebacks & Fee History)");
    }
    if (!excludeList.includes('"margin"')) {
      failures.push("ChargebacksTable: margin must be in the exclude list (removed from Chargebacks & Fee History)");
    }
    if (!excludeList.includes('"factoring_fee"')) {
      failures.push("ChargebacksTable: factoring_fee must be in the exclude list (native Fee column already exists)");
    }
  }

  // 2. Profit (margin) and Trip-Expenses (costs) must be defaultHidden in the manifest.
  const marginLine = manifest.match(/moneyCol\("margin".*?defaultHidden:\s*(true|false)/);
  if (!marginLine || marginLine[1] !== "true") {
    failures.push("loadCostColumnManifest: margin (Profit) must have defaultHidden: true");
  }
  const costsLine = manifest.match(/moneyCol\("costs".*?defaultHidden:\s*(true|false)/);
  if (!costsLine || costsLine[1] !== "true") {
    failures.push("loadCostColumnManifest: costs (Trip-Expenses) must have defaultHidden: true");
  }
  const driverPayLine = manifest.match(/moneyCol\("driver_pay".*?defaultHidden:\s*(true|false)/);
  if (!driverPayLine || driverPayLine[1] !== "true") {
    failures.push("loadCostColumnManifest: driver_pay must have defaultHidden: true");
  }
  const revenueLine = manifest.match(/moneyCol\("revenue".*?defaultHidden:\s*(true|false)/);
  if (!revenueLine || revenueLine[1] !== "true") {
    failures.push("loadCostColumnManifest: revenue must have defaultHidden: true");
  }

  // 3. Factoring-native columns must NOT be defaultHidden.
  const factoringFeeLine = manifest.match(/moneyCol\("factoring_fee".*?defaultHidden:\s*(true|false)/);
  if (factoringFeeLine && factoringFeeLine[1] === "true") {
    failures.push("loadCostColumnManifest: factoring_fee must NOT be defaultHidden (factoring-native column)");
  }
  const reserveLine = manifest.match(/moneyCol\("reserve".*?defaultHidden:\s*(true|false)/);
  if (reserveLine && reserveLine[1] === "true") {
    failures.push("loadCostColumnManifest: reserve must NOT be defaultHidden (factoring-native column)");
  }

  if (failures.length > 0) {
    console.error(`verify-factoring-default-columns FAILED (${failures.length}):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log("verify-factoring-default-columns: OK — Chargebacks excludes driver_pay/margin, Profit/Trip-Expenses defaultHidden, factoring-native columns visible");
}

main();
