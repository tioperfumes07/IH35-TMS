#!/usr/bin/env node
/** Fleet estimator/editor/QBO metadata are not posted-GL / load-reverse surfaces; real bank/finance reverse leaves keep GL. */
import fs from "node:fs";
const LABEL = "verify-fleet-gl-je-required-honest";
const requiredPath = "docs/specs/scoreboard/modules/fleet.required.json";
const forbidden = ["roster.row.edit_unit", "unit.profile.trip_cost", "unit.profile.qbo_mapping", "unit.edit.financial"];
const mustKeep = ["unit.profile.bank_txns", "unit.detail.finance_linkage", "trailer.profile.bank_txns"];
const tripCostForbiddenCols = ["gl_je", "load", "reverse_link"];
function audit(doc, sources) {
  const failures = [];
  const leaves = new Map((doc.leaves || []).map((leaf) => [leaf.id, leaf]));
  for (const id of forbidden) {
    const leaf = leaves.get(id);
    if (!leaf) failures.push(`missing ${id}`);
    else if ((leaf.required || []).includes("gl_je")) failures.push(`${id} must not require gl_je`);
  }
  const trip = leaves.get("unit.profile.trip_cost");
  if (!trip) failures.push("missing unit.profile.trip_cost");
  else {
    for (const col of tripCostForbiddenCols) {
      if ((trip.required || []).includes(col)) {
        failures.push(`unit.profile.trip_cost must not require ${col} (ZIP estimator, not a load/JE reverse surface)`);
      }
    }
    if (!(trip.required || []).includes("unit") || !(trip.required || []).includes("connectivity")) {
      failures.push("unit.profile.trip_cost must keep unit + connectivity");
    }
  }
  if (!doc.honesty_audit?.trip_cost_2026_08_19_load_reverse) {
    failures.push("fleet.required.json missing honesty_audit.trip_cost_2026_08_19_load_reverse");
  }
  for (const id of mustKeep) {
    const leaf = leaves.get(id);
    if (!leaf) failures.push(`missing KEEP ${id}`);
    else if (!(leaf.required || []).includes("gl_je")) failures.push(`${id} must keep gl_je`);
  }
  if (/journal_entry|kind="journal_entry"/.test(sources.trip)) failures.push("trip cost gained a JE; re-scope and wire it");
  if (/kind="load"/.test(sources.trip)) failures.push("trip cost gained a load drill; inventing load FKs is forbidden");
  if (!/EntityLinkOrTombstone[\s\S]{0,120}kind="unit"/.test(sources.trip) || !/data-testid="vp-trip-cost-unit-link"/.test(sources.trip)) {
    failures.push("trip cost must EntityLinkOrTombstone the unit (vp-trip-cost-unit-link)");
  }
  if (!/Add to quote is not available/.test(sources.trip)) {
    failures.push("trip cost must honest-copy that Add to quote / load writer is unavailable (no V1 no-op button)");
  }
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
    ["trip-load", "load"],
    ["trip-reverse", "reverse_link"],
    ["source", "bank"],
    ["source", "finance"],
    ["source", "trip"],
    ["source", "trip-unit"],
    ["source", "trip-copy"],
  ];
  for (const [kind, id] of mutations) {
    const candidateDoc = structuredClone(doc);
    const candidateSources = { ...sources };
    if (kind === "forbidden" || kind === "keep") {
      const leaf = candidateDoc.leaves.find((item) => item.id === id);
      leaf.required = kind === "forbidden" ? [...new Set([...(leaf.required || []), "gl_je"])] : leaf.required.filter((c) => c !== "gl_je");
    } else if (kind === "trip-load" || kind === "trip-reverse") {
      const leaf = candidateDoc.leaves.find((item) => item.id === "unit.profile.trip_cost");
      leaf.required = [...new Set([...(leaf.required || []), id])];
    } else if (id === "trip") candidateSources.trip += '\nconst journal_entry_id = "regression";';
    else if (id === "trip-unit") candidateSources.trip = candidateSources.trip.replace(/EntityLinkOrTombstone/g, "MissingUnitLink");
    else if (id === "trip-copy") candidateSources.trip = candidateSources.trip.replace(/Add to quote is not available/g, "Add to quote");
    else candidateSources[id] = candidateSources[id].replace(/kind="journal_entry"/g, 'kind="expense"');
    if (audit(candidateDoc, candidateSources).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${kind}:${id}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`);
  process.exit(0);
}
const failures = audit(doc, sources);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — Fleet GL/load Required DROPs are honest and real JE reverse leaves remain mandatory`);
