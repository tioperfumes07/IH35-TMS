#!/usr/bin/env node
/** @matrix-built modules=settlements cols=connectivity leafRe=^pre_settlements$ task=SETTLE-SWEEP-PRE */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = readFileSync(root + "apps/frontend/src/pages/Drivers.tsx", "utf8");
// 443.284: the 443.274-C / 443.280-A board feeds the tab from the tours engine (open tours = open pre-settlements,
// with Unit / Ready / Waiting on). The population law is unchanged: the COMPLETE company-scoped open list, never a
// capped first page — so the client listTours must page to the route's count.
const client = readFileSync(root + "apps/frontend/src/api/tourReadout.ts", "utf8");
function assertWiring(page, api = client) {
  const tab = page.match(/subnavTab === "pre_settlements" \? \(([\s\S]*?)\) : null/);
  const query = page.match(/const preSettlementsQuery = useQuery\(\{([\s\S]*?)\}\);/);
  const lister = api.match(/export async function listTours\(([\s\S]*?)\n\}/);
  if (!tab?.[1].includes("rows={preSettlementsQuery.data?.rows ?? []}") ||
      !tab[1].includes("isError={preSettlementsQuery.isError}") ||
      !query?.[1].includes('queryFn: () => listTours(selectedCompanyId!, "open")') ||
      !lister?.[1].includes("while (rows.length < first.count)") ||
      !lister[1].includes("&offset=${rows.length}") ||
      !lister[1].includes('throw new Error("The tour list is incomplete.')) {
    throw new Error("Standalone Pre-Settlements must use the complete company-scoped open list, not the capped payment-ready preview");
  }
}
assertWiring(source);
const route = readFileSync(root + "apps/backend/src/driver-finance/settlements.routes.ts", "utf8");
const tours = readFileSync(root + "apps/backend/src/driver-finance/tour-readout.routes.ts", "utf8");
function assertToursPage(src) {
  if (!/s\.trip_closed_at DESC"\}, s\.id DESC\s+LIMIT \$2 OFFSET \$3/.test(src) || !src.includes("q.data.limit, q.data.offset)")) {
    throw new Error("Tour pages require OFFSET paging with a unique id tie-breaker");
  }
}
assertToursPage(tours);
function assertStablePages(sql) {
  if (!/ORDER BY v\.period_start DESC, v\.id DESC\s+LIMIT/.test(sql)) {
    throw new Error("Settlement pages require a unique ID tie-breaker for equal period dates");
  }
}
assertStablePages(route);
const plants = [
  ["tour pages lose the id tie-breaker", () => assertToursPage(tours.replace('"}, s.id DESC', '"}'))],
  ["tour route ignores the offset", () => assertToursPage(tours.replace("q.data.limit, q.data.offset)", "q.data.limit)"))],
  ["equal-date pages lose the id tie-breaker", () => assertStablePages(route.replace("ORDER BY v.period_start DESC, v.id DESC", "ORDER BY v.period_start DESC"))],
  ["tab hides query errors", () => assertWiring(source.replace("isError={preSettlementsQuery.isError}", "isError={false}"))],
  ["tab renders the capped payment-ready preview", () => assertWiring(source.replace("rows={preSettlementsQuery.data?.rows ?? []}", "rows={settlementsReadyRows}"))],
  ["list not company-scoped", () => assertWiring(source.replace('queryFn: () => listTours(selectedCompanyId!, "open"),\n    enabled: Boolean(selectedCompanyId) && subnavTab === "pre_settlements"', 'queryFn: () => listTours("", "open"),\n    enabled: Boolean(selectedCompanyId) && subnavTab === "pre_settlements"'))],
  ["client reads only the first 200-row page", () => assertWiring(source, client.replace("while (rows.length < first.count)", "while (false)"))],
  ["client re-reads page one forever", () => assertWiring(source, client.replace("&offset=${rows.length}", "&offset=0"))],
  ["short page shown as the full list", () => assertWiring(source, client.replace('throw new Error("The tour list is incomplete.', 'break; ("'))],
];
let caughtCount = 0;
for (const [name, plant] of plants) {
  let caught = false;
  try { plant(); } catch { caught = true; }
  if (!caught) throw new Error("Mutation escaped: " + name);
  caughtCount += 1;
}
// --selftest: the static half only (clean sources pass above, every plant is caught) — no vitest spawn.
if (process.argv.includes("--selftest")) {
  console.log(`verify-settlement-sweep-pre-list SELFTEST: ${caughtCount}/${plants.length} planted violations caught (clean sources pass)`);
  process.exit(0);
}
const result = spawnSync(process.execPath, [root + "node_modules/vitest/vitest.mjs", "run", "--config", root + "apps/frontend/vitest.config.ts",
  "src/api/preSettlements.test.ts", "src/api/tourReadout.paging.test.ts", "src/components/driver-finance/__tests__/PreSettlementsPanel.test.tsx"],
{ cwd: root + "apps/frontend", stdio: "inherit", timeout: 120000 });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
console.log("verify-settlement-sweep-pre-list PASS: full population, paging, terminal exclusions, query errors and old-wiring mutation");
