#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const LABEL = "verify-fuel-expense-identity-honesty";
const IDS = [
  "home", "planner", "relay_inbox", "history", "fuel.modal.import_fuel_transactions",
  "fuel.modal.create_fuel_transaction", "fuel.modal.upload_loves_prices", "fuel.panel.savings",
];
const SURFACES = [
  "apps/frontend/src/pages/fuel/FuelHome.tsx",
  "apps/frontend/src/pages/fuel/FuelPlannerHome.tsx",
  "apps/frontend/src/pages/fuel/components/ImportFuelTransactionsModal.tsx",
  "apps/frontend/src/pages/fuel/components/CreateFuelTransactionModal.tsx",
  "apps/frontend/src/pages/fuel/components/UploadLovesPricesModal.tsx",
  "apps/frontend/src/pages/fuel/components/SavingsPanel.tsx",
];

export function audit(doc, surfaces) {
  const failures = [];
  const leaves = new Map(doc.leaves.map((leaf) => [leaf.id, leaf]));
  for (const id of IDS) {
    if (!leaves.has(id)) failures.push(`${id}: leaf missing`);
    else if ((leaves.get(id).required || []).includes("expense")) failures.push(`${id}: fuel record falsely claims accounting expense identity`);
  }
  for (const [file, source] of Object.entries(surfaces)) {
    if (/kind=["']expense["']|\bexpense_id\b|accounting\.expenses/.test(source)) {
      failures.push(`${file}: gained accounting expense identity; re-scope and guard it`);
    }
  }
  return failures;
}

const doc = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/specs/scoreboard/modules/fuel.required.json"), "utf8"));
const surfaces = Object.fromEntries(SURFACES.map((file) => [file, fs.readFileSync(path.join(ROOT, file), "utf8")]));

if (process.argv.includes("--selftest")) {
  for (const id of IDS) {
    const mutated = structuredClone(doc);
    mutated.leaves.find((leaf) => leaf.id === id).required.push("expense");
    if (!audit(mutated, surfaces).some((failure) => failure.includes(id))) {
      console.error(`${LABEL} SELFTEST FAIL — ${id} mutation escaped`);
      process.exit(1);
    }
  }
  const mutatedSurfaces = { ...surfaces, [SURFACES[0]]: '<EntityLink kind="expense" id={expense_id} />' };
  if (!audit(doc, mutatedSurfaces).some((failure) => failure.includes(SURFACES[0]))) {
    console.error(`${LABEL} SELFTEST FAIL — source mutation escaped`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${IDS.length + 1} mutations detected`);
  process.exit(0);
}

const failures = audit(doc, surfaces);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — fuel records stay distinct from accounting expense identities; expense mapping remains explicit`);
