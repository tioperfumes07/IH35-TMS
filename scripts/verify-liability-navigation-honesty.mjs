#!/usr/bin/env node
/** Liability Built truth: navigation/configuration/create chrome cannot claim a liability identity it never reads or writes. */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const LABEL = "verify-liability-navigation-honesty";
const FORBIDDEN = {
  "cash-flow": ["hop.banking", "hop.reports.cash_flow_statement", "hop.reports.cash_flow", "hop.reports.cash_flow_overview", "hop.cash_advances"],
  factoring: ["dispatch.queue", "factoring.modal.deactivate_factor_confirm", "factoring.modal.reserve_dashboard_add_factor", "factoring.panel.factoring_profile", "factoring.wizard.batch", "factoring.parity.driver_autocomplete"],
  finance: ["hub", "hub.alias"],
  legal: ["reports"],
  safety: ["damage_reports.create", "safety.modal.fine_create", "safety.parity.fine_create"],
};

const SURFACES = [
  "apps/frontend/src/pages/cash-flow/CashFlowPage.tsx",
  "apps/frontend/src/pages/dispatch/FactoringQueuePage.tsx",
  "apps/frontend/src/components/factoring/DeactivateFactorConfirmModal.tsx",
  "apps/frontend/src/components/factoring/DriverAutocomplete.tsx",
  "apps/frontend/src/pages/factoring/FactoringProfilePanel.tsx",
  "apps/frontend/src/pages/factoring/ReserveDashboardAddFactorModal.tsx",
  "apps/frontend/src/pages/finance/FinanceHubPage.tsx",
  "apps/frontend/src/pages/legal/reports/LegalReportsLandingPage.tsx",
  "apps/frontend/src/pages/safety/DamageReportsPage.tsx",
  "apps/frontend/src/pages/safety/components/FineCreateModal.tsx",
];

export function audit(docs, surfaces) {
  const failures = [];
  for (const [module, ids] of Object.entries(FORBIDDEN)) {
    const leaves = new Map((docs[module]?.leaves || []).map((leaf) => [leaf.id, leaf]));
    for (const id of ids) {
      if (!leaves.has(id)) failures.push(`${module}.${id}: leaf missing`);
      else if ((leaves.get(id).required || []).includes("liability")) failures.push(`${module}.${id}: false liability Required`);
    }
  }
  for (const [file, source] of Object.entries(surfaces)) {
    if (/kind=["']liability["']|driver_finance\.driver_liabilities/.test(source)) failures.push(`${file}: gained liability identity; re-scope Required instead of suppressing it`);
  }
  return failures;
}

const docs = Object.fromEntries(Object.keys(FORBIDDEN).map((module) => [module, JSON.parse(fs.readFileSync(path.join(ROOT, `docs/specs/scoreboard/modules/${module}.required.json`), "utf8"))]));
const surfaces = Object.fromEntries(SURFACES.map((file) => [file, fs.readFileSync(path.join(ROOT, file), "utf8")]));

if (process.argv.includes("--selftest")) {
  let mutations = 0;
  for (const [module, ids] of Object.entries(FORBIDDEN)) {
    for (const id of ids) {
      const mutated = structuredClone(docs);
      mutated[module].leaves.find((leaf) => leaf.id === id).required.push("liability");
      if (!audit(mutated, surfaces).some((failure) => failure.includes(`${module}.${id}`))) {
        console.error(`${LABEL} SELFTEST FAIL — ${module}.${id} mutation escaped`);
        process.exit(1);
      }
      mutations++;
    }
  }
  const mutatedSurfaces = { ...surfaces, [SURFACES[0]]: '<EntityLink kind="liability" id={id} />' };
  if (!audit(docs, mutatedSurfaces).some((failure) => failure.includes(SURFACES[0]))) {
    console.error(`${LABEL} SELFTEST FAIL — surface mutation escaped`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations + 1} mutations detected`);
  process.exit(0);
}

const failures = audit(docs, surfaces);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — ${Object.values(FORBIDDEN).flat().length} navigation/configuration/create leaves remain liability-honest`);
