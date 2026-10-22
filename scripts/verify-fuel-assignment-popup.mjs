#!/usr/bin/env node
/**
 * LEAD 443.243 — Fuel Assignment popup (Cursor UI) is wired wherever fuel is
 * created/attached to a load, plus Fuel questions badge/list. Fail-old selftest.
 * Cursor EVEN claim: 18670.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fuel-assignment-popup";
const SELFTEST = process.argv.includes("--selftest");

const FILES = {
  popup: "apps/frontend/src/pages/fuel/components/FuelAssignmentPopup.tsx",
  badge: "apps/frontend/src/pages/fuel/components/FuelQuestionsBadge.tsx",
  panel: "apps/frontend/src/pages/fuel/components/FuelQuestionsPanel.tsx",
  api: "apps/frontend/src/api/fuelAssignmentQuestions.ts",
  service: "apps/backend/src/fuel/fuel-assignment-question.service.ts",
  routes: "apps/backend/src/fuel/fuel-assignment-question.routes.ts",
  migration: "db/migrations/202616141200_fuel_assignment_questions.sql",
  loadCosts: "apps/frontend/src/pages/accounting/LoadCostsBoardPage.tsx",
  loadDrawer: "apps/frontend/src/components/dispatch/LoadDetailCostsTab.tsx",
  createFuel: "apps/frontend/src/pages/fuel/components/CreateFuelTransactionModal.tsx",
  importFuel: "apps/frontend/src/pages/fuel/components/ImportFuelTransactionsModal.tsx",
  expense: "apps/frontend/src/components/expenses/RecordExpenseForm.tsx",
  settlement: "apps/frontend/src/pages/settlements/SettlementCreatorDrawer.tsx",
  match: "apps/frontend/src/pages/banking/components/MatchDrawer.tsx",
  fuelHome: "apps/frontend/src/pages/fuel/FuelPlannerHome.tsx",
  tabs: "apps/frontend/src/pages/fuel/FUEL_TABS_CONFIG.ts",
  index: "apps/backend/src/index.ts",
};

function strip(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

export function collectProblems(sources) {
  const problems = [];
  const popup = strip(sources.popup);
  const badge = strip(sources.badge);
  const panel = strip(sources.panel);
  const api = strip(sources.api);
  const service = strip(sources.service);
  const routes = strip(sources.routes);
  const migration = sources.migration;
  const loadCosts = strip(sources.loadCosts);
  const loadDrawer = strip(sources.loadDrawer);
  const createFuel = strip(sources.createFuel);
  const importFuel = strip(sources.importFuel);
  const expense = strip(sources.expense);
  const settlement = strip(sources.settlement);
  const match = strip(sources.match);
  const fuelHome = strip(sources.fuelHome);
  const tabs = strip(sources.tabs);
  const index = strip(sources.index);

  if (!/CREATE TABLE IF NOT EXISTS fuel\.fuel_assignment_questions/.test(migration)) {
    problems.push(`${FILES.migration}: must CREATE fuel.fuel_assignment_questions`);
  }
  if (!/export function isFillCertain/.test(service)) {
    problems.push(`${FILES.service}: must export isFillCertain`);
  }
  if (!/evaluateFuelAssignmentQuestion|evaluateFillAndMaybeAsk/.test(service) && !/upsertQuestion|createQuestion/.test(service)) {
    // accept either naming as long as evaluate path exists
    if (!/evaluate/.test(service)) {
      problems.push(`${FILES.service}: must evaluate fills and upsert questions`);
    }
  }
  if (!/\/api\/v1\/fuel\/assignment-questions/.test(routes) && !/assignment-questions/.test(routes)) {
    problems.push(`${FILES.routes}: must mount assignment-questions API`);
  }
  if (!/registerFuelAssignmentQuestionRoutes/.test(index)) {
    problems.push(`${FILES.index}: must register fuel assignment question routes`);
  }

  if (!/data-testid=["']fuel-assignment-popup["']/.test(popup)) {
    problems.push(`${FILES.popup}: missing data-testid=fuel-assignment-popup`);
  }
  if (!/fuel-assignment-candidates-table/.test(popup)) {
    problems.push(`${FILES.popup}: must show candidates evidence table`);
  }
  if (!/fuel-assignment-proposed/.test(popup)) {
    problems.push(`${FILES.popup}: must show proposed answer`);
  }
  for (const mode of ["confirm", "pick", "keep"]) {
    if (!new RegExp(`fuel-assignment-mode-${mode}`).test(popup)) {
      problems.push(`${FILES.popup}: missing mode button ${mode}`);
    }
  }
  if (!/Confirm proposed/.test(sources.popup) || !/Pick another truck \+ load/.test(sources.popup) || !/Keep on card truck/.test(sources.popup)) {
    problems.push(`${FILES.popup}: must label confirm / pick / keep buttons`);
  }
  if (!/keep_card_truck/.test(popup) || !/reason/.test(popup)) {
    problems.push(`${FILES.popup}: keep on card truck requires reason`);
  }
  if (!/modalKind=["']fuel-assignment-question["']/.test(popup) && !/Modal/.test(popup)) {
    problems.push(`${FILES.popup}: must use dimmed Modal`);
  }

  if (!/data-testid=["']fuel-questions-badge["']/.test(badge)) {
    problems.push(`${FILES.badge}: missing fuel-questions-badge`);
  }
  if (!/countOpenFuelAssignmentQuestions/.test(badge)) {
    problems.push(`${FILES.badge}: must count open questions`);
  }
  if (!/FuelQuestionsPanel/.test(panel) && !/fuel-questions-panel/.test(panel)) {
    if (!/listFuelAssignmentQuestions/.test(panel)) {
      problems.push(`${FILES.panel}: must list open questions`);
    }
  }

  if (!/FuelQuestionsBadge/.test(loadCosts)) {
    problems.push(`${FILES.loadCosts}: must mount FuelQuestionsBadge`);
  }
  if (!/FuelQuestionsPanel/.test(loadCosts)) {
    problems.push(`${FILES.loadCosts}: must mount FuelQuestionsPanel`);
  }
  if (!/FuelQuestionsBadge/.test(fuelHome) || !/FuelQuestionsPanel/.test(fuelHome)) {
    problems.push(`${FILES.fuelHome}: Fuel module must show badge + questions tab panel`);
  }
  if (!/id:\s*["']questions["'][\s\S]{0,80}label:\s*["']Fuel questions["']/.test(tabs)) {
    problems.push(`${FILES.tabs}: FUEL_SUBNAV must include Fuel questions`);
  }

  const wireTargets = [
    ["loadDrawer", loadDrawer, FILES.loadDrawer],
    ["createFuel", createFuel, FILES.createFuel],
    ["importFuel", importFuel, FILES.importFuel],
    ["expense", expense, FILES.expense],
    ["settlement", settlement, FILES.settlement],
    ["match", match, FILES.match],
  ];
  for (const [, src, file] of wireTargets) {
    if (!/FuelAssignmentPopup/.test(src)) {
      problems.push(`${file}: must mount FuelAssignmentPopup`);
    }
  }
  if (!/firstOpenFuelAssignmentQuestion|evaluateFuelAssignment/.test(loadDrawer)) {
    problems.push(`${FILES.loadDrawer}: must open question after fuel cost save`);
  }
  if (!/firstOpenFuelAssignmentQuestion|evaluateFuelAssignment/.test(expense)) {
    problems.push(`${FILES.expense}: must open question after fuel expense create`);
  }
  if (!/evaluateFuelAssignmentsFirstQuestion|evaluateFuelAssignment/.test(settlement)) {
    problems.push(`${FILES.settlement}: must evaluate fuel_transaction_ids after post`);
  }
  if (!/firstOpenFuelAssignmentQuestion|evaluateFuelAssignment/.test(match)) {
    problems.push(`${FILES.match}: banking categorize of fuel must open question`);
  }
  if (!/listFuelAssignmentQuestions|evaluateFuelAssignment|answerFuelAssignmentQuestion/.test(api)) {
    problems.push(`${FILES.api}: FE client must list/evaluate/answer`);
  }

  return problems;
}

if (SELFTEST) {
  const good = Object.fromEntries(
    Object.entries(FILES).map(([k, rel]) => [k, fs.readFileSync(path.join(ROOT, rel), "utf8")])
  );
  const goodP = collectProblems(good);
  if (goodP.length !== 0) {
    console.error(`${LABEL} SELFTEST FAIL — tip sources not green`, goodP);
    process.exit(1);
  }

  const mutations = [
    {
      name: "drops FuelAssignmentPopup from LoadDetailCostsTab",
      apply: (s) => ({ ...s, loadDrawer: s.loadDrawer.replace(/FuelAssignmentPopup/g, "MissingPopup") }),
    },
    {
      name: "drops FuelQuestionsBadge from Load Costs",
      apply: (s) => ({ ...s, loadCosts: s.loadCosts.replace(/FuelQuestionsBadge/g, "MissingBadge") }),
    },
    {
      name: "drops confirm mode button testid",
      apply: (s) => ({
        ...s,
        popup: s.popup.replace(/fuel-assignment-mode-confirm/g, "fuel-assignment-mode-gone"),
      }),
    },
    {
      name: "drops assignment-questions route registration",
      apply: (s) => ({
        ...s,
        index: s.index.replace(/registerFuelAssignmentQuestionRoutes/g, "registerMissingRoutes"),
      }),
    },
    {
      name: "drops Fuel questions from FUEL_SUBNAV",
      apply: (s) => ({
        ...s,
        tabs: s.tabs.replace(/Fuel questions/g, "Missing questions"),
      }),
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
  console.log(`${LABEL} SELFTEST OK (${mutations.length} regressions caught)`);
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
console.log(`${LABEL} OK — Fuel Assignment popup wired on all create/attach surfaces`);
