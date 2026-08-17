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
  // LV-FUEL-LOVES-UPLOAD-FALSE-LOAD-REQUIRED — company price-feed import must not Require load.
  const loves = leaves.get("fuel.modal.upload_loves_prices");
  if (loves && (loves.required || []).includes("load")) {
    failures.push("fuel.modal.upload_loves_prices: falsely Requires load (company-wide Loves price-feed; no trip FK)");
  }
  const lovesAudit = doc.honesty_audit?.load_column_2026_08_17_loves_upload;
  if (!lovesAudit?.drops?.some((d) => d.id === "fuel.modal.upload_loves_prices" && (d.removed || []).includes("load"))) {
    failures.push("honesty_audit.load_column_2026_08_17_loves_upload must record load drop for upload_loves_prices");
  }
  const lovesModal = surfaces["apps/frontend/src/pages/fuel/components/UploadLovesPricesModal.tsx"] || "";
  if (lovesModal && /\bload_id\b/.test(lovesModal)) {
    failures.push("UploadLovesPricesModal must not invent load_id");
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
  const loadMut = structuredClone(doc);
  loadMut.leaves.find((leaf) => leaf.id === "fuel.modal.upload_loves_prices").required.push("load");
  if (!audit(loadMut, surfaces).some((failure) => failure.includes("falsely Requires load"))) {
    console.error(`${LABEL} SELFTEST FAIL — loves load Required mutation escaped`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${IDS.length + 2} mutations detected`);
  process.exit(0);
}

const failures = audit(doc, surfaces);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — fuel records stay distinct from accounting expense identities; expense mapping remains explicit`);
