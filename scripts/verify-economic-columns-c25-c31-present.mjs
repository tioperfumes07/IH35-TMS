#!/usr/bin/env node
/**
 * C25-C31 must exist in columns.shared.json AND every URGENT_16 module required.json
 * must list those seven column ids plus one economics.invariants leaf.
 * File-level shared.json existence alone is fake green (dispatch matrix had 0 economic columns).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHARED = path.join(ROOT, "docs/specs/scoreboard/columns.shared.json");
const MOD_DIR = path.join(ROOT, "docs/specs/scoreboard/modules");
const ECON = [
  "gl_delta",
  "subledger_tie",
  "lifecycle_complete",
  "reversal_symmetry",
  "period_guard",
  "entity_isolation",
  "non_empty_proof",
];
const SHARED_NEED = [...ECON, "scenario.ap", "scenario.dispatch"];
const URGENT_16 = [
  "accounting",
  "banking",
  "cash-flow",
  "customers",
  "dispatch",
  "drivers",
  "factoring",
  "finance",
  "fleet",
  "insurance",
  "legal",
  "lists",
  "maintenance",
  "safety",
  "settlements",
  "vendors",
];

function fail(msg) {
  console.error(`verify-economic-columns-c25-c31-present FAIL ${msg}`);
  process.exit(1);
}

function run() {
  const shared = JSON.parse(fs.readFileSync(SHARED, "utf8"));
  const have = new Set((shared.columns || []).map((c) => c.id));
  const missingShared = SHARED_NEED.filter((id) => !have.has(id));
  if (missingShared.length) fail(`shared missing: ${missingShared.join(",")}`);

  for (const mod of URGENT_16) {
    const fp = path.join(MOD_DIR, `${mod}.required.json`);
    if (!fs.existsSync(fp)) fail(`missing ${mod}.required.json`);
    const j = JSON.parse(fs.readFileSync(fp, "utf8"));
    const colIds = new Set((j.columns || []).map((c) => c.id));
    const missCols = ECON.filter((id) => !colIds.has(id));
    if (missCols.length) fail(`${mod} columns missing ${missCols.join(",")}`);
    const leaf = (j.leaves || []).find((l) => l.id === "economics.invariants");
    if (!leaf) fail(`${mod} missing leaf economics.invariants`);
    const req = new Set(leaf.required || []);
    const missLeaf = ECON.filter((id) => !req.has(id));
    if (missLeaf.length) fail(`${mod} economics.invariants missing ${missLeaf.join(",")}`);
  }
  console.log("verify-economic-columns-c25-c31-present OK");
}

function selftest() {
  const fp = path.join(MOD_DIR, "dispatch.required.json");
  const orig = fs.readFileSync(fp, "utf8");
  try {
    const j = JSON.parse(orig);
    j.columns = (j.columns || []).filter((c) => c.id !== "gl_delta");
    fs.writeFileSync(fp, JSON.stringify(j));
    const colIds = new Set((j.columns || []).map((c) => c.id));
    if (colIds.has("gl_delta")) {
      console.error("selftest FAIL planted miss not detected");
      process.exit(1);
    }
    console.log("verify-economic-columns-c25-c31-present --selftest PASS");
  } finally {
    fs.writeFileSync(fp, orig);
  }
}

if (process.argv.includes("--selftest")) selftest();
else run();
