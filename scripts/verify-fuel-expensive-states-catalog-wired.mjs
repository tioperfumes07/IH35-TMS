#!/usr/bin/env node
/**
 * verify-fuel-expensive-states-catalog-wired.mjs  (0441-mod3-fuel-expensive-states-free-text)
 *
 * Root cause: Fuel Planner Settings used a free-text comma-separated input for expensive_states
 * even though catalogs.expensive_states already exists with a full CRUD list page and API client.
 *
 * Fix: PlannerSettingsForm renders ExpensiveStatesMultiselect, which loads active rows from
 * expensiveStatesCatalogClient (GET /api/v1/catalogs/fuel/expensive-states) instead of parsing
 * manual text input.
 *
 * NON-FINANCIAL: frontend-only wiring to pre-existing catalog endpoint. No schema/migration touch.
 *
 * Usage:
 *   node scripts/verify-fuel-expensive-states-catalog-wired.mjs            # scan
 *   node scripts/verify-fuel-expensive-states-catalog-wired.mjs --selftest # regression
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

const PLANNER_HOME = "apps/frontend/src/pages/fuel/FuelPlannerHome.tsx";
const MULTISELECT = "apps/frontend/src/pages/fuel/components/ExpensiveStatesMultiselect.tsx";
const CATALOGS_FUEL = "apps/frontend/src/api/catalogs-fuel.ts";
const BACKEND_CATALOG = "apps/backend/src/catalogs/fuel/index.ts";

function read(rel) {
  const full = path.join(repoRoot, rel);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, "utf8");
}

/** Pure checks for --selftest. */
export function checkPlannerUsesCatalogMultiselect(plannerSrc, multiselectSrc) {
  const failures = [];
  if (multiselectSrc === null) {
    failures.push(`${MULTISELECT} is missing`);
    return failures;
  }
  if (!/ExpensiveStatesMultiselect/.test(plannerSrc)) {
    failures.push("FuelPlannerHome.tsx must import + render ExpensiveStatesMultiselect in PlannerSettingsForm");
  }
  if (!/expensiveStatesCatalogClient/.test(multiselectSrc)) {
    failures.push("ExpensiveStatesMultiselect must load options via expensiveStatesCatalogClient");
  }
  if (!/type="checkbox"/.test(multiselectSrc)) {
    failures.push("ExpensiveStatesMultiselect must use checkbox multiselect (not free-text input)");
  }
  if (/Expensive states \(2-letter, comma-separated\)/.test(plannerSrc)) {
    failures.push("FuelPlannerHome.tsx still has the free-text 'comma-separated' expensive states label");
  }
  if (/placeholder="NY, PA, NJ, CA"/.test(plannerSrc)) {
    failures.push("FuelPlannerHome.tsx still has the free-text expensive states placeholder");
  }
  if (/expensiveStates[\s\S]{0,80}\.split\(\","/.test(plannerSrc)) {
    failures.push("FuelPlannerHome.tsx still parses expensive states from comma-separated free text");
  }
  return failures;
}

export function checkCatalogBackendExists(catalogsFuelSrc, backendCatalogSrc) {
  const failures = [];
  if (catalogsFuelSrc === null) {
    failures.push(`${CATALOGS_FUEL} is missing`);
  } else if (!/expensiveStatesCatalogClient/.test(catalogsFuelSrc)) {
    failures.push(`${CATALOGS_FUEL} must export expensiveStatesCatalogClient`);
  } else if (!/expensive-states/.test(catalogsFuelSrc)) {
    failures.push(`${CATALOGS_FUEL} expensiveStatesCatalogClient must target /expensive-states segment`);
  }

  if (backendCatalogSrc === null) {
    failures.push(`${BACKEND_CATALOG} is missing`);
  } else if (!/tableName:\s*"expensive_states"/.test(backendCatalogSrc)) {
    failures.push(`${BACKEND_CATALOG} must register catalogs.expensive_states`);
  } else if (!/urlSegment:\s*"expensive-states"/.test(backendCatalogSrc)) {
    failures.push(`${BACKEND_CATALOG} expensive_states route must use urlSegment expensive-states`);
  }
  return failures;
}

function scan() {
  const plannerSrc = read(PLANNER_HOME);
  const multiselectSrc = read(MULTISELECT);
  const catalogsFuelSrc = read(CATALOGS_FUEL);
  const backendCatalogSrc = read(BACKEND_CATALOG);

  const failures = [];
  if (plannerSrc === null) {
    failures.push(`${PLANNER_HOME} is missing`);
    return failures;
  }

  failures.push(...checkPlannerUsesCatalogMultiselect(plannerSrc, multiselectSrc));
  failures.push(...checkCatalogBackendExists(catalogsFuelSrc, backendCatalogSrc));
  return failures;
}

export function run() {
  const failures = scan();
  if (failures.length) {
    console.error("[verify-fuel-expensive-states-catalog-wired] FAIL — Fuel expensive states not catalog-wired:");
    for (const f of failures) console.error(`  - ${f}`);
    return { ok: false, offenders: failures };
  }
  console.log(
    "[verify-fuel-expensive-states-catalog-wired] PASS — Planner settings use catalogs.expensive_states multiselect, not free text.",
  );
  return { ok: true, offenders: [] };
}

export function check() {
  return run().ok;
}

function selftest() {
  const goodPlanner = `
    import { ExpensiveStatesMultiselect } from "./components/ExpensiveStatesMultiselect";
    const [expensiveStates, setExpensiveStates] = useState<string[]>([]);
    <ExpensiveStatesMultiselect companyId={companyId} value={expensiveStates} onChange={setExpensiveStates} />
  `;
  const badPlanner = `
    <span>Expensive states (2-letter, comma-separated)</span>
    <input placeholder="NY, PA, NJ, CA" value={expensiveStates} onChange={(e) => setExpensiveStates(e.target.value)} />
    expensiveStates.split(",").map((s) => s.trim())
  `;

  const goodMultiselect = `
    import { expensiveStatesCatalogClient } from "../../../api/catalogs-fuel";
    expensiveStatesCatalogClient.list({ operating_company_id: companyId, is_active: "true" });
    <input type="checkbox" checked={checked} />
  `;
  const badMultiselect = `<input type="text" placeholder="NY, PA" />`;

  const goodCatalogsFuel = `export const expensiveStatesCatalogClient = createFuelCatalogClient("expensive-states");`;
  const goodBackend = `tableName: "expensive_states", urlSegment: "expensive-states"`;

  let ok = true;
  const expectPass = (name, failures) => {
    if (failures.length) {
      console.error(`[verify-fuel-expensive-states-catalog-wired] SELFTEST FAIL — expected pass for "${name}", got: ${failures.join("; ")}`);
      ok = false;
    }
  };
  const expectFail = (name, failures) => {
    if (!failures.length) {
      console.error(`[verify-fuel-expensive-states-catalog-wired] SELFTEST FAIL — expected failure for "${name}", got none`);
      ok = false;
    }
  };

  expectPass("good planner", checkPlannerUsesCatalogMultiselect(goodPlanner, goodMultiselect));
  expectFail("bad free-text planner", checkPlannerUsesCatalogMultiselect(badPlanner, goodMultiselect));
  expectFail("bad multiselect (text input)", checkPlannerUsesCatalogMultiselect(goodPlanner, badMultiselect));
  expectPass("catalog backend", checkCatalogBackendExists(goodCatalogsFuel, goodBackend));
  expectFail("missing backend", checkCatalogBackendExists(null, null));

  if (!ok) process.exit(1);
  console.log("[verify-fuel-expensive-states-catalog-wired] SELFTEST PASS — recognizes catalog-wired vs free-text states.");
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else process.exit(run().ok ? 0 : 1);
}
