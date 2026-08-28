#!/usr/bin/env node
import fs from "node:fs";

const consumers = [
  "apps/frontend/src/components/insurance/ClaimCreateModal.tsx",
  "apps/frontend/src/components/safety/AccidentReportDrawer.tsx",
  "apps/frontend/src/pages/safety/SafetyEventsPage.tsx",
  "apps/frontend/src/pages/safety/components/HosViolationCreateModal.tsx",
  "apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx",
];
const shared = "apps/frontend/src/components/shared/LoadSuggestionReadError.tsx";

function findings(read) {
  const out = [];
  const helper = read(shared);
  if (!/if \(!query\.isError\) return null/.test(helper)) out.push(`${shared}: helper is not keyed to resolver failure`);
  if (!/Active-trip load suggestion failed/.test(helper) || !/query\.refetch\(\)/.test(helper)) {
    out.push(`${shared}: helper lacks honest message and exact Retry`);
  }
  for (const file of consumers) {
    const source = read(file);
    if (!/suggestExpenseLoad/.test(source)) out.push(`${file}: no canonical suggest-load resolver`);
    if (!/<LoadSuggestionReadError query=\{suggestionQuery\}/.test(source)) out.push(`${file}: resolver failure remains silent`);
  }
  return out;
}

const all = [...consumers, shared];
const baseline = new Map(all.map((file) => [file, fs.readFileSync(file, "utf8")]));
const clean = findings((file) => baseline.get(file));
if (clean.length) {
  console.error(clean.join("\n"));
  process.exit(1);
}
if (process.argv.includes("--selftest")) {
  const planted = new Map(baseline);
  const file = consumers[0];
  planted.set(file, planted.get(file).replace("<LoadSuggestionReadError query={suggestionQuery} />", ""));
  if (!findings((name) => planted.get(name)).some((line) => line.includes("resolver failure remains silent"))) {
    console.error("selftest failed: silent resolver mutation escaped");
    process.exit(1);
  }
}
console.log(`verify-nonmoney-suggest-load-fails-loud: PASS (${consumers.length} consumers${process.argv.includes("--selftest") ? ", mutation caught" : ""})`);
