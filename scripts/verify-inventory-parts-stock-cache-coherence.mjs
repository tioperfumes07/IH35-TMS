#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const files = {
  keys: "apps/frontend/src/pages/inventory/partsStockQueryKeys.ts",
  stock: "apps/frontend/src/pages/inventory/InventoryPartsStockPage.tsx",
  create: "apps/frontend/src/pages/inventory/PartCreateDrawer.tsx",
  edit: "apps/frontend/src/pages/inventory/PartEditDrawer.tsx",
  purchases: "apps/frontend/src/pages/inventory/InventoryPurchasesPage.tsx",
  maintenance: "apps/frontend/src/pages/maintenance/MaintenanceHome.tsx",
  table: "apps/frontend/src/pages/maintenance/components/PartsInventoryTable.tsx",
  backend: "apps/backend/src/maintenance/parts-inventory.routes.ts",
};

function read(base, file) {
  return fs.readFileSync(path.join(base, file), "utf8");
}

function verify(base) {
  const failures = [];
  const source = Object.fromEntries(Object.entries(files).map(([name, file]) => [name, read(base, file)]));
  const require = (ok, message) => { if (!ok) failures.push(message); };

  require(source.keys.includes('inventoryPartsStockQueryKey'), "missing Inventory stock cache key");
  require(source.keys.includes('maintenancePartsStockQueryKey'), "missing Maintenance stock cache key");
  require(source.keys.includes('invalidatePartsStockQueries'), "missing shared stock invalidator");
  require((source.keys.match(/invalidateQueries/g) ?? []).length === 2, "shared invalidator must refresh both mounted stock projections");
  require(source.stock.includes('queryKey: inventoryPartsStockQueryKey(operatingCompanyId)'), "Inventory Parts & Stock is not using the canonical key");
  require(source.maintenance.includes('queryKey: maintenancePartsStockQueryKey(companyId)'), "Maintenance Parts Inventory is not using the canonical key");

  for (const name of ["create", "edit", "purchases", "table"]) {
    require(source[name].includes("invalidatePartsStockQueries("), `${files[name]} does not invalidate both stock projections`);
  }
  require((source.table.match(/invalidatePartsStockQueries\(/g) ?? []).length >= 2, "purchase and adjustment mutations must both invalidate stock projections");
  require(source.backend.includes('COALESCE(on_hand_qty, 0) - $2'), "purchase void no longer reverses canonical stock quantity");
  require(source.backend.includes('parts_purchase_reversal_insufficient_stock'), "purchase void must fail closed when exact reversal is impossible");
  return failures;
}

const failures = verify(root);
if (failures.length) {
  console.error(`INV-F6914 cache coherence guard FAILED (${failures.length})`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "inv-f6914-"));
  for (const file of Object.values(files)) {
    const target = path.join(tmp, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, file), target);
  }
  const target = path.join(tmp, files.purchases);
  fs.writeFileSync(target, read(tmp, files.purchases).replace("invalidatePartsStockQueries(queryClient, companyId)", 'queryClient.invalidateQueries({ queryKey: ["maintenance", "parts-inventory", companyId] })'));
  const planted = verify(tmp);
  fs.rmSync(tmp, { recursive: true, force: true });
  if (!planted.some((failure) => failure.includes(files.purchases))) {
    console.error("INV-F6914 selftest FAILED: planted one-way invalidation escaped the guard");
    process.exit(1);
  }
  console.log("INV-F6914 selftest PASS: planted one-way invalidation was rejected");
}

console.log("INV-F6914 PASS: all stock mutations refresh both canonical mounted projections");
