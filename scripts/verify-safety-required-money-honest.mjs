#!/usr/bin/env node
/**
 * SAFETY-REQUIRED-MONEY-INFLATION — Safety create/list chrome must not claim expense/ap_bill
 * when the surface has no expense/bill write or drill (DoD-C). FineDetailDrawer documents a
 * future company-paid expense→GL leg; create modals still have no expense/ap fields.
 *
 * Usage: node scripts/verify-safety-required-money-honest.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REQ = path.join(ROOT, "docs/specs/scoreboard/modules/safety.required.json");
const LABEL = "verify-safety-required-money-honest";

const FORBIDDEN = {
  "accidents.create": ["expense"],
  "damage_reports.create": ["expense"],
  "cargo_claims.create": ["expense", "ap_bill"],
  "external_fines.create": ["expense", "ap_bill"],
  "external_fines.list": ["ap_bill"],
  "permits.list": ["ap_bill"],
};

function load() {
  return JSON.parse(fs.readFileSync(REQ, "utf8"));
}

function offenders(doc) {
  const byId = Object.fromEntries((doc.leaves || []).map((l) => [l.id, l]));
  const out = [];
  for (const [id, cols] of Object.entries(FORBIDDEN)) {
    const leaf = byId[id];
    if (!leaf) {
      out.push(`missing ${id}`);
      continue;
    }
    for (const c of cols) {
      if ((leaf.required || []).includes(c)) out.push(`${id} must NOT require ${c}`);
    }
  }
  return out;
}

if (process.argv.includes("--selftest")) {
  const clone = structuredClone(load());
  const leaf = clone.leaves.find((l) => l.id === "accidents.create");
  if (!leaf) {
    console.error(`${LABEL} --selftest FAIL`);
    process.exit(1);
  }
  leaf.required = [...(leaf.required || []), "expense"];
  if (!offenders(clone).length) {
    console.error(`${LABEL} --selftest FAIL poison`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const bad = offenders(load());
const accidentsPage = fs.readFileSync(
  path.join(ROOT, "apps/frontend/src/pages/safety/AccidentsPage.tsx"),
  "utf8",
);
if (/expense_id|createExpense|kind=["']expense["']/.test(accidentsPage)) {
  bad.push("AccidentsPage now has expense — remove accidents.create expense from FORBIDDEN");
}

if (bad.length) {
  console.error(`${LABEL} FAIL:\n${bad.map((b) => ` - ${b}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — safety create/list expense|ap_bill inflation DROPs held`);
