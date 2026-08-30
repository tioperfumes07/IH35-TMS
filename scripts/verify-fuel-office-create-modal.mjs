#!/usr/bin/env node
/** @matrix-built {"modules":["fuel","fleet","dispatch"],"cols":["trailer","unit","load","connectivity","picker_law"],"leafRe":"^(history|transactions|trailer\.|unit\.|load\.|create)","task":"CREATE-PATH-TRIP-FUEL-OFFICE-CREATE","pr":"#6330"} */
/**
 * Fuel History must offer office create → POST /api/v1/fuel/transactions with
 * EntityPicker unit/trailer/load + G18 exemption. Cursor EVEN claim: 3140.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fuel-office-create-modal";
const SELFTEST = process.argv.includes("--selftest");

const FILES = {
  modal: "apps/frontend/src/pages/fuel/components/CreateFuelTransactionModal.tsx",
  home: "apps/frontend/src/pages/fuel/FuelPlannerHome.tsx",
  api: "apps/frontend/src/api/fuelPlanner.ts",
};

function strip(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

export function collectProblems(sources) {
  const problems = [];
  const modal = strip(sources.modal);
  const home = strip(sources.home);
  const api = strip(sources.api);

  if (!/createFuelTransaction\(/.test(modal)) {
    problems.push(`${FILES.modal}: must call createFuelTransaction`);
  }
  for (const kind of ["unit", "trailer", "load", "driver", "vendor"]) {
    if (!new RegExp(`kind=["']${kind}["']`).test(modal)) {
      problems.push(`${FILES.modal}: missing EntityPicker kind=${kind}`);
    }
  }
  if (!/load_exemption_reason/.test(modal) || !/loadId/.test(modal)) {
    problems.push(`${FILES.modal}: G18 requires load_id or load_exemption_reason`);
  }
  if (!/CreateFuelTransactionModal/.test(home) || !/\+ Create/.test(sources.home)) {
    problems.push(`${FILES.home}: History must mount CreateFuelTransactionModal with + Create`);
  }
  if (!/export function createFuelTransaction/.test(api) || !/\/api\/v1\/fuel\/transactions/.test(api)) {
    problems.push(`${FILES.api}: createFuelTransaction must POST /api/v1/fuel/transactions`);
  }
  if (!/trailer_id/.test(api)) {
    problems.push(`${FILES.api}: create body must include trailer_id`);
  }

  // FUEL-MONEY-F7418 — suggestExpenseLoad rejecting was previously silent: the effect that
  // auto-fills loadId from a suggestion simply never ran, indistinguishable from "no matching load
  // found," and the operator could still submit via the G18 exemption unaware auto-linkage was
  // never evaluated. Fail-loud + non-blocking (manual load pick and G18 exemption must still work).
  if (!/suggestionQuery\.isError/.test(modal)) {
    problems.push(`${FILES.modal}: must branch on suggestionQuery.isError (a failed load-suggestion read must not render as a silent "no suggestion")`);
  }
  if (!/<ListErrorState[\s\S]{0,200}onRetry=\{\(\) => void suggestionQuery\.refetch\(\)\}/.test(modal)) {
    problems.push(`${FILES.modal}: must render ListErrorState wired to suggestionQuery.refetch() on error`);
  }
  return problems;
}

if (SELFTEST) {
  const bad = {
    modal: `<EntityPicker kind="unit" />`,
    home: `Import only`,
    api: `export function importFuelTransactions() {}`,
  };
  const good = {
    modal: `
      createFuelTransaction(operatingCompanyId, { load_exemption_reason: "x", trailer_id: t })
      <EntityPicker kind="unit" />
      <EntityPicker kind="trailer" />
      <EntityPicker kind="load" />
      <EntityPicker kind="driver" />
      <EntityPicker kind="vendor" />
      const loadId = "";
      {suggestionQuery.isError ? (
        <ListErrorState title="x" status={0} message={y} onRetry={() => void suggestionQuery.refetch()} />
      ) : null}
    `,
    home: `CreateFuelTransactionModal\n+ Create`,
    api: `
      export function createFuelTransaction() {
        return apiRequest("/api/v1/fuel/transactions", { body: { trailer_id } });
      }
    `,
  };
  const badP = collectProblems(bad);
  const goodP = collectProblems(good);
  if (badP.length < 4 || goodP.length !== 0) {
    console.error(`${LABEL} SELFTEST FAIL`, { badP, goodP });
    process.exit(1);
  }

  // FUEL-MONEY-F7418 planted regressions: each mutation removes ONE piece of the fix and must
  // independently fail against the otherwise-good fixture.
  const mutations = [
    {
      name: "drops the isError branch entirely (read failure renders as a silent no-suggestion)",
      apply: (s) => ({ ...s, modal: s.modal.replace(/suggestionQuery\.isError/g, "false") }),
    },
    {
      name: "ListErrorState's Retry is disconnected from suggestionQuery.refetch()",
      apply: (s) => ({ ...s, modal: s.modal.replace("onRetry={() => void suggestionQuery.refetch()}", "onRetry={() => {}}") }),
    },
  ];
  let allCaught = true;
  for (const m of mutations) {
    const mutated = m.apply(good);
    if (collectProblems(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — NOT CAUGHT: ${m.name}`);
      allCaught = false;
    }
  }
  if (!allCaught) process.exit(1);

  console.log(`${LABEL} SELFTEST OK (${mutations.length} FUEL-MONEY-F7418 regressions caught)`);
  process.exit(0);
}

const sources = Object.fromEntries(
  Object.entries(FILES).map(([k, rel]) => [k, fs.readFileSync(path.join(ROOT, rel), "utf8")])
);
const problems = collectProblems(sources);
if (problems.length) {
  console.error(`${LABEL} FAIL`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — fuel office create modal wired`);
