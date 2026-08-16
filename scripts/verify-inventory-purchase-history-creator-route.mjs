#!/usr/bin/env node
/** Ratchet: Inventory Purchase History must deep-link to the canonical Maintenance purchase creator. */
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");

function verify({ purchases, home, table }) {
  const failures = [];
  const route = "/maintenance/parts-inventory?create=purchase";
  if (!purchases.includes(`to="${route}"`)) failures.push("Purchase History lacks canonical creator deep-link");
  if (!purchases.includes("+ Record Purchase")) failures.push("Purchase History lacks visible creator action");
  if (/Record a purchase from Parts & Stock/.test(purchases)) failures.push("empty state still routes operators to a leaf with no purchase action");
  if (!home.includes('openPurchaseOnMount={searchParams.get("create") === "purchase"}')) failures.push("Maintenance route does not consume the creator deep-link");
  if (!table.includes("openPurchaseOnMount?: boolean")) failures.push("canonical creator component lacks deep-link contract");
  if (!table.includes("useState(openPurchaseOnMount)")) failures.push("canonical purchase modal does not open from route intent");
  return failures;
}

const sources = {
  purchases: read("apps/frontend/src/pages/inventory/InventoryPurchasesPage.tsx"),
  home: read("apps/frontend/src/pages/maintenance/MaintenanceHome.tsx"),
  table: read("apps/frontend/src/pages/maintenance/components/PartsInventoryTable.tsx"),
};
const failures = verify(sources);
if (failures.length) {
  console.error(`FAIL verify-inventory-purchase-history-creator-route:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    { ...sources, purchases: sources.purchases.replaceAll("/maintenance/parts-inventory?create=purchase", "/inventory") },
    { ...sources, purchases: sources.purchases.replaceAll("+ Record Purchase", "Purchase") },
    { ...sources, home: sources.home.replace('searchParams.get("create") === "purchase"', "false") },
    { ...sources, table: sources.table.replace("useState(openPurchaseOnMount)", "useState(false)") },
  ];
  const caught = mutations.filter((mutation) => verify(mutation).length > 0).length;
  if (caught !== mutations.length) {
    console.error(`FAIL verify-inventory-purchase-history-creator-route selftest: caught ${caught}/${mutations.length}`);
    process.exit(1);
  }
  console.log(`PASS verify-inventory-purchase-history-creator-route selftest: ${caught}/${mutations.length} planted defects caught`);
} else {
  console.log("PASS verify-inventory-purchase-history-creator-route");
}
