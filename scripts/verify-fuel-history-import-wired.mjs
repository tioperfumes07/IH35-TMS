#!/usr/bin/env node
/**
 * verify-fuel-history-import-wired.mjs  (module 03-fuel G1/G2)
 *
 * Root cause: the Fuel "History & savings" tab (apps/frontend/src/pages/fuel/FuelPlannerHome.tsx)
 * rendered <FuelTransactionsTable rows={[]} /> hardcoded and its "Import Fuel Transactions" button was
 * `disabled` with a "coming soon (requires backend endpoint)" toast — even though the backend already
 * had both a list reader (GET /api/v1/fuel/transactions, apps/backend/src/fuel/fuel-transactions.routes.ts)
 * and an import writer (POST /api/v1/fuel/transactions/import,
 * apps/backend/src/fuel/fuel-transaction-import.routes.ts), both registered in apps/backend/src/index.ts.
 *
 * This guard locks: the History tab (a) fetches real data via a getFuelTransactions() query keyed off
 * tab === "history" and renders it into FuelTransactionsTable, and (b) the Import button has a real
 * onClick handler (opens ImportFuelTransactionsModal) instead of `disabled` + a "coming soon" toast.
 *
 * NON-FINANCIAL: frontend-only wiring to pre-existing, already-registered backend endpoints. No schema,
 * no migration, no accounting/catalogs/mdata touch.
 *
 * Usage:
 *   node scripts/verify-fuel-history-import-wired.mjs            # scan
 *   node scripts/verify-fuel-history-import-wired.mjs --selftest # regression -> must recognize good/bad
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

const PLANNER_HOME = "apps/frontend/src/pages/fuel/FuelPlannerHome.tsx";
const API_CLIENT = "apps/frontend/src/api/fuelPlanner.ts";
const IMPORT_MODAL = "apps/frontend/src/pages/fuel/components/ImportFuelTransactionsModal.tsx";
const REVERSE_SECTION = "apps/frontend/src/components/fuel/FuelTransactionsReverseSection.tsx";
const TX_TABLE = "apps/frontend/src/pages/fuel/FuelTransactionsTable.tsx";
const BACKEND_LIST_ROUTE = "apps/backend/src/fuel/fuel-transactions.routes.ts";
const BACKEND_IMPORT_ROUTE = "apps/backend/src/fuel/fuel-transaction-import.routes.ts";
const BACKEND_INDEX = "apps/backend/src/index.ts";
const REVERSE_MOUNTS = [
  ["apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx", "load_id"],
  ["apps/frontend/src/pages/drivers/DriverProfilePage.tsx", "driver_id"],
  ["apps/frontend/src/pages/fleet/VehicleProfilePage.tsx", "unit_id"],
  ["apps/frontend/src/pages/fleet/TrailerProfilePage.tsx", "trailer_id"],
];

function read(rel) {
  const full = path.join(repoRoot, rel);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, "utf8");
}

/** Pure checks factored out so --selftest can exercise them against synthetic strings. */
function checkHistoryFetchWired(plannerSrc, apiClientSrc) {
  const failures = [];
  if (!/getFuelTransactions/.test(apiClientSrc)) {
    failures.push("api/fuelPlanner.ts must export getFuelTransactions() calling GET /api/v1/fuel/transactions");
  }
  if (!/\/api\/v1\/fuel\/transactions(?!\/import)/.test(apiClientSrc)) {
    failures.push("api/fuelPlanner.ts getFuelTransactions must call /api/v1/fuel/transactions");
  }
  if (!/getFuelTransactions/.test(plannerSrc)) {
    failures.push("FuelPlannerHome.tsx must import + call getFuelTransactions (History tab real fetch)");
  }
  if (!/rows=\{fuelTransactionsQuery\.data\?\.transactions/.test(plannerSrc) && !/rows=\{[^}]*\.transactions/.test(plannerSrc)) {
    failures.push("FuelPlannerHome.tsx must pass fetched transactions into <FuelTransactionsTable rows={...} />, not a hardcoded []");
  }
  // The historical dead state: hardcoded empty rows with no query gating it.
  if (/<FuelTransactionsTable\s+rows=\{\[\]\}\s*\/>/.test(plannerSrc)) {
    failures.push("FuelPlannerHome.tsx still renders <FuelTransactionsTable rows={[]} /> (hardcoded empty — the unwired defect)");
  }
  return failures;
}

/** ACCT-F5048 — reverse Open Fuel History must stay filtered on the money list. */
function checkDeepLinkFilters(plannerSrc, reverseSrc, tableSrc) {
  const failures = [];
  if (!/searchParams\.get\("trailer_id"\)/.test(plannerSrc)) {
    failures.push("FuelPlannerHome.tsx must read trailer_id from the URL (reverse deep-link)");
  }
  if (!/trailer_id:\s*deepLinkTrailerId/.test(plannerSrc) && !/trailer_id:\s*deepLinkTrailerId\s*\|\|/.test(plannerSrc)) {
    failures.push("FuelPlannerHome.tsx must pass trailer_id into getFuelTransactions()");
  }
  if (!/FUEL_HISTORY_KIND/.test(reverseSrc ?? "") || !/kind=\{FUEL_HISTORY_KIND\[filterKey\]\}/.test(reverseSrc ?? "") || !/fuel_history_driver/.test(reverseSrc ?? "") || !/fuel_history_trailer/.test(reverseSrc ?? "")) {
    failures.push("FuelTransactionsReverseSection Open Fuel History must use EntityLink FUEL_HISTORY_KIND filter map");
  }
  if (!/kind="trailer"[\s\S]{0,120}?row\.trailer_id/.test(tableSrc ?? "")) {
    failures.push("FuelTransactionsTable must render Trailer EntityLink column");
  }
  return failures;
}

function checkImportButtonWired(plannerSrc, importModalSrc) {
  const failures = [];
  if (/Import Fuel Transactions[\s\S]{0,120}?disabled/.test(plannerSrc) || /disabled[\s\S]{0,120}?Import Fuel Transactions/.test(plannerSrc)) {
    failures.push("Import Fuel Transactions button must not be `disabled` (dead-button defect)");
  }
  if (/coming soon \(requires backend endpoint\)/.test(plannerSrc)) {
    failures.push("FuelPlannerHome.tsx still has the 'coming soon (requires backend endpoint)' dead-button toast");
  }
  if (!/setImportOpen\(true\)/.test(plannerSrc)) {
    failures.push("Import button must have a real onClick handler (setImportOpen(true) opening the import modal)");
  }
  if (!/ImportFuelTransactionsModal/.test(plannerSrc)) {
    failures.push("FuelPlannerHome.tsx must import + render ImportFuelTransactionsModal");
  }
  if (importModalSrc === null) {
    failures.push(`${IMPORT_MODAL} is missing`);
  } else if (!/importFuelTransactions/.test(importModalSrc)) {
    failures.push("ImportFuelTransactionsModal must call importFuelTransactions() (the real backend call)");
  }
  return failures;
}

function checkBackendEndpointsExist(listRouteSrc, importRouteSrc, indexSrc) {
  const failures = [];
  if (listRouteSrc === null) failures.push(`${BACKEND_LIST_ROUTE} is missing`);
  else if (!/\/api\/v1\/fuel\/transactions["'`]/.test(listRouteSrc)) failures.push(`${BACKEND_LIST_ROUTE} must define GET /api/v1/fuel/transactions`);

  if (importRouteSrc === null) failures.push(`${BACKEND_IMPORT_ROUTE} is missing`);
  else if (!/\/api\/v1\/fuel\/transactions\/import["'`]/.test(importRouteSrc)) failures.push(`${BACKEND_IMPORT_ROUTE} must define POST /api/v1/fuel/transactions/import`);

  if (indexSrc === null) failures.push(`${BACKEND_INDEX} is missing`);
  else {
    if (!/registerFuelTransactionsRoutes/.test(indexSrc)) failures.push(`${BACKEND_INDEX} must register registerFuelTransactionsRoutes`);
    if (!/registerFuelTransactionImportRoutes/.test(indexSrc)) failures.push(`${BACKEND_INDEX} must register registerFuelTransactionImportRoutes`);
  }
  return failures;
}

function checkReverseVendorLabels(apiClientSrc, reverseSrc, listRouteSrc, mountSources) {
  const failures = [];
  if (!/v\.vendor_name/.test(listRouteSrc ?? "") || !/vendor_name:\s*row\.vendor_name/.test(listRouteSrc ?? "")) {
    failures.push("fuel list must project and return the same-company canonical vendor_name");
  }
  if (!/vendor_name:\s*string \| null/.test(apiClientSrc ?? "")) {
    failures.push("FuelTransactionListItem must type vendor_name");
  }
  if (!/entityLabel\(row\.vendor_name, row\.vendor_id, "Vendor"\)/.test(reverseSrc ?? "")) {
    failures.push("shared fuel reverse section must consume vendor_name in the vendor EntityLink");
  }
  for (const [file, filter] of REVERSE_MOUNTS) {
    const src = mountSources[file] ?? "";
    if (!new RegExp(`<FuelTransactionsReverseSection[\\s\\S]{0,220}?filter=\\{\\{\\s*${filter}:`).test(src)) {
      failures.push(`${file} must mount the shared fuel reverse section with ${filter}`);
    }
  }
  return failures;
}

function scan() {
  const plannerSrc = read(PLANNER_HOME);
  const apiClientSrc = read(API_CLIENT);
  const importModalSrc = read(IMPORT_MODAL);
  const reverseSrc = read(REVERSE_SECTION);
  const tableSrc = read(TX_TABLE);
  const listRouteSrc = read(BACKEND_LIST_ROUTE);
  const importRouteSrc = read(BACKEND_IMPORT_ROUTE);
  const indexSrc = read(BACKEND_INDEX);
  const mountSources = Object.fromEntries(REVERSE_MOUNTS.map(([file]) => [file, read(file) ?? ""]));

  const failures = [];
  if (plannerSrc === null) {
    failures.push(`${PLANNER_HOME} is missing`);
    return failures;
  }
  if (apiClientSrc === null) {
    failures.push(`${API_CLIENT} is missing`);
    return failures;
  }

  failures.push(...checkHistoryFetchWired(plannerSrc, apiClientSrc));
  failures.push(...checkDeepLinkFilters(plannerSrc, reverseSrc, tableSrc));
  failures.push(...checkImportButtonWired(plannerSrc, importModalSrc));
  failures.push(...checkBackendEndpointsExist(listRouteSrc, importRouteSrc, indexSrc));
  failures.push(...checkReverseVendorLabels(apiClientSrc, reverseSrc, listRouteSrc, mountSources));
  return failures;
}

export function run() {
  const failures = scan();
  if (failures.length) {
    console.error("[verify-fuel-history-import-wired] FAIL — Fuel History tab / Import button not fully wired:");
    for (const f of failures) console.error(`  - ${f}`);
    return { ok: false, offenders: failures };
  }
  console.log("[verify-fuel-history-import-wired] PASS — History tab fetches real fuel transactions; Import button opens the real import flow.");
  return { ok: true, offenders: [] };
}

export function check() {
  return run().ok;
}

function selftest() {
  const goodApiClient = `export function getFuelTransactions(companyId) { return apiRequest(\`/api/v1/fuel/transactions?x\`); }`;
  const badApiClientMissing = `export function otherThing() {}`;

  const goodPlanner = `
    import { getFuelTransactions } from "../../api/fuelPlanner";
    import { ImportFuelTransactionsModal } from "./components/ImportFuelTransactionsModal";
    const deepLinkTrailerId = searchParams.get("trailer_id");
    const fuelTransactionsQuery = useQuery({ queryFn: () => getFuelTransactions(companyId, { trailer_id: deepLinkTrailerId || undefined }) });
    <ActionButton onClick={() => setImportOpen(true)}>Import Fuel Transactions</ActionButton>
    <FuelTransactionsTable rows={fuelTransactionsQuery.data?.transactions ?? []} />
    <ImportFuelTransactionsModal open={importOpen} />
  `;
  const badPlannerDeadButton = `
    <ActionButton disabled onClick={() => pushToast("Fuel import UI coming soon (requires backend endpoint)", "info")}>
      Import Fuel Transactions
    </ActionButton>
    <FuelTransactionsTable rows={[]} />
  `;
  const goodReverse = `const FUEL_HISTORY_KIND = { driver_id: "fuel_history_driver", trailer_id: "fuel_history_trailer" }; kind={FUEL_HISTORY_KIND[filterKey]}`;
  const goodTable = 'kind="trailer" id={row.trailer_id} label={entityLabel(row.trailer_number';
  const badReverse = 'to="/fuel/history"';
  const badTable = 'kind="load" id={row.load_id}';

  const goodImportModal = `import { importFuelTransactions } from "../../../api/fuelPlanner";`;

  const goodListRoute = `app.get("/api/v1/fuel/transactions", async () => {});`;
  const goodImportRoute = `app.post("/api/v1/fuel/transactions/import", async () => {});`;
  const goodIndex = `registerFuelTransactionsRoutes(app); registerFuelTransactionImportRoutes(app);`;
  const goodVendorApi = `vendor_name: string | null;`;
  const goodVendorReverse = `entityLabel(row.vendor_name, row.vendor_id, "Vendor")`;
  const goodVendorRoute = `SELECT v.vendor_name FROM x; vendor_name: row.vendor_name`;
  const goodMounts = Object.fromEntries(REVERSE_MOUNTS.map(([file, filter]) => [file, `<FuelTransactionsReverseSection filter={{ ${filter}: id }} />`]));

  let ok = true;
  const expectPass = (name, failures) => {
    if (failures.length) {
      console.error(`[verify-fuel-history-import-wired] SELFTEST FAIL — expected pass for "${name}", got: ${failures.join("; ")}`);
      ok = false;
    }
  };
  const expectFail = (name, failures) => {
    if (!failures.length) {
      console.error(`[verify-fuel-history-import-wired] SELFTEST FAIL — expected failure for "${name}", got none`);
      ok = false;
    }
  };

  expectPass("good history fetch", checkHistoryFetchWired(goodPlanner, goodApiClient));
  expectFail("bad api client (no getFuelTransactions)", checkHistoryFetchWired(goodPlanner, badApiClientMissing));
  expectFail("dead rows={[]} planner", checkHistoryFetchWired(badPlannerDeadButton, goodApiClient));

  expectPass("good deeplink filters", checkDeepLinkFilters(goodPlanner, goodReverse, goodTable));
  expectFail("unfiltered Open Fuel History", checkDeepLinkFilters(goodPlanner, badReverse, goodTable));
  expectFail("missing trailer column", checkDeepLinkFilters(goodPlanner, goodReverse, badTable));

  expectPass("good import button", checkImportButtonWired(goodPlanner, goodImportModal));
  expectFail("disabled + coming-soon import button", checkImportButtonWired(badPlannerDeadButton, goodImportModal));
  expectFail("import modal missing", checkImportButtonWired(goodPlanner, null));

  expectPass("backend endpoints present", checkBackendEndpointsExist(goodListRoute, goodImportRoute, goodIndex));
  expectFail("backend endpoints missing", checkBackendEndpointsExist(null, null, null));
  expectPass("vendor label across four reverse mounts", checkReverseVendorLabels(goodVendorApi, goodVendorReverse, goodVendorRoute, goodMounts));
  expectFail("vendor mapper dropped", checkReverseVendorLabels(goodVendorApi, goodVendorReverse, goodVendorRoute.replace("vendor_name: row.vendor_name", "vendor_id: row.vendor_id"), goodMounts));
  expectFail("vendor type dropped", checkReverseVendorLabels("vendor_id: string", goodVendorReverse, goodVendorRoute, goodMounts));
  expectFail("vendor label unresolved", checkReverseVendorLabels(goodVendorApi, `entityLabel(null, row.vendor_id, "Vendor")`, goodVendorRoute, goodMounts));
  expectFail("load reverse mount dropped", checkReverseVendorLabels(goodVendorApi, goodVendorReverse, goodVendorRoute, { ...goodMounts, [REVERSE_MOUNTS[0][0]]: "" }));

  if (!ok) process.exit(1);
  console.log("[verify-fuel-history-import-wired] SELFTEST PASS — recognizes wired vs dead-button/hardcoded-empty states.");
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else process.exit(run().ok ? 0 : 1);
}
