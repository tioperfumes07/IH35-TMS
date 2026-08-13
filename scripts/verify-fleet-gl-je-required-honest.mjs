#!/usr/bin/env node
/** Fleet estimator/editor/QBO metadata are not posted-GL surfaces; real bank/finance reverse leaves keep GL. */
import fs from "node:fs";
const LABEL = "verify-fleet-gl-je-required-honest";
const requiredPath = "docs/specs/scoreboard/modules/fleet.required.json";
const forbidden = ["roster.row.edit_unit", "unit.profile.trip_cost", "unit.profile.qbo_mapping", "unit.edit.financial"];
const mustKeep = ["unit.profile.bank_txns", "unit.detail.finance_linkage", "trailer.profile.bank_txns"];
function audit(doc, sources) {
  const failures = [];
  const leaves = new Map((doc.leaves || []).map((leaf) => [leaf.id, leaf]));
  for (const id of forbidden) {
    const leaf = leaves.get(id);
    if (!leaf) failures.push(`missing ${id}`);
    else if ((leaf.required || []).includes("gl_je")) failures.push(`${id} must not require gl_je`);
  }
  for (const id of mustKeep) {
    const leaf = leaves.get(id);
    if (!leaf) failures.push(`missing KEEP ${id}`);
    else if (!(leaf.required || []).includes("gl_je")) failures.push(`${id} must keep gl_je`);
  }
  if (/journal_entry|kind="journal_entry"/.test(sources.trip)) failures.push("trip cost gained a JE; re-scope and wire it");
  if (/journal_entry|kind="journal_entry"/.test(sources.edit)) failures.push("vehicle editor gained a JE; re-scope and wire it");
  if (!/kind="journal_entry"/.test(sources.bank)) failures.push("shared bank panel must keep its canonical JE drill");
  if ((sources.finance.match(/kind="journal_entry"/g) || []).length < 2) failures.push("unit finance tab must keep bill and expense JE drills");
  return failures;
}
const doc = JSON.parse(fs.readFileSync(requiredPath, "utf8"));
const sources = {
  trip: fs.readFileSync("apps/frontend/src/components/vehicle-profile/TripCostCalculator.tsx", "utf8"),
  edit: fs.readFileSync("apps/frontend/src/components/fleet/EditVehicleModal.tsx", "utf8"),
  bank: fs.readFileSync("apps/frontend/src/components/banking/LinkedBankTransactionsPanel.tsx", "utf8"),
  finance: fs.readFileSync("apps/frontend/src/pages/units/UnitFinanceLinkageTab.tsx", "utf8"),
};
if (process.argv.includes("--selftest")) {
  const mutations = [
    ...forbidden.map((id) => ["forbidden", id]),
    ...mustKeep.map((id) => ["keep", id]),
    ["source", "bank"],
    ["source", "finance"],
    ["source", "trip"],
  ];
  for (const [kind, id] of mutations) {
    const candidateDoc = structuredClone(doc);
    const candidateSources = { ...sources };
    if (kind === "forbidden" || kind === "keep") {
      const leaf = candidateDoc.leaves.find((item) => item.id === id);
      leaf.required = kind === "forbidden" ? [...new Set([...(leaf.required || []), "gl_je"])] : leaf.required.filter((c) => c !== "gl_je");
    } else if (id === "trip") candidateSources.trip += '\nconst journal_entry_id = "regression";';
    else candidateSources[id] = candidateSources[id].replace(/kind="journal_entry"/g, 'kind="expense"');
    if (audit(candidateDoc, candidateSources).length === 0) { console.error(`${LABEL} SELFTEST FAIL — ${kind}:${id}`); process.exit(1); }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`); process.exit(0);
}
const failures = audit(doc, sources);
if (failures.length) { console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log(`${LABEL} PASS — Fleet GL Required DROPs are honest and real JE reverse leaves remain mandatory`);
