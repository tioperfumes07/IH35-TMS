#!/usr/bin/env node
/** @matrix-built modules=settlements cols=connectivity task=SETTLE-SWEEP-PRE */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = readFileSync(root + "apps/frontend/src/pages/Drivers.tsx", "utf8");
function assertWiring(page) {
  const tab = page.match(/subnavTab === "pre_settlements" \? \(([\s\S]*?)\) : null/);
  if (!tab?.[1].includes("rows={preSettlementsQuery.data ?? []}") ||
      !tab[1].includes("isError={preSettlementsQuery.isError}") ||
      !page.includes("queryFn: () => listOpenPreSettlements(selectedCompanyId!)")) {
    throw new Error("Standalone Pre-Settlements must use the complete company-scoped open list, not the capped payment-ready preview");
  }
}
assertWiring(source);
const route = readFileSync(root + "apps/backend/src/driver-finance/settlements.routes.ts", "utf8");
function assertStablePages(sql) {
  if (!/ORDER BY v\.period_start DESC, v\.id DESC\s+LIMIT/.test(sql)) {
    throw new Error("Settlement pages require a unique ID tie-breaker for equal period dates");
  }
}
assertStablePages(route);
let orderCaught = false;
try { assertStablePages(route.replace("ORDER BY v.period_start DESC, v.id DESC", "ORDER BY v.period_start DESC")); }
catch { orderCaught = true; }
if (!orderCaught) throw new Error("Unstable pagination mutation escaped");
let caught = false;
try { assertWiring(source.replace("rows={preSettlementsQuery.data ?? []}", "rows={settlementsReadyRows}")); }
catch { caught = true; }
if (!caught) throw new Error("Old preview wiring mutation escaped");
const result = spawnSync(process.execPath, [root + "node_modules/vitest/vitest.mjs", "run", "--config", root + "apps/frontend/vitest.config.ts",
  "src/api/preSettlements.test.ts", "src/components/driver-finance/__tests__/PreSettlementsPanel.test.tsx"],
{ cwd: root + "apps/frontend", stdio: "inherit", timeout: 120000 });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
console.log("verify-settlement-sweep-pre-list PASS: full population, paging, terminal exclusions, query errors and old-wiring mutation");
