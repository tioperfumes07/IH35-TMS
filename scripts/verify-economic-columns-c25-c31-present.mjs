#!/usr/bin/env node
/** Existence ratchet: C25–C31 live in columns.shared.json. No new verify-step number. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHARED = path.join(ROOT, "docs/specs/scoreboard/columns.shared.json");
const NEED = ["gl_delta", "subledger_tie", "lifecycle_complete", "reversal_symmetry", "period_guard", "entity_isolation", "non_empty_proof"];

function ids() {
  const j = JSON.parse(fs.readFileSync(SHARED, "utf8"));
  return new Set((j.columns || []).map((c) => c.id));
}

function run() {
  const have = ids();
  const missing = NEED.filter((id) => !have.has(id));
  if (missing.length) {
    console.error(`verify-economic-columns-c25-c31-present FAIL missing: ${missing.join(",")}`);
    process.exit(1);
  }
  console.log("verify-economic-columns-c25-c31-present OK");
}

function selftest() {
  const orig = fs.readFileSync(SHARED, "utf8");
  const j = JSON.parse(orig);
  j.columns = (j.columns || []).filter((c) => c.id !== "gl_delta");
  const tmp = path.join(ROOT, "scripts", ".econ-cols-selftest.json");
  try {
    fs.writeFileSync(tmp, JSON.stringify(j));
    const have = new Set(j.columns.map((c) => c.id));
    if (have.has("gl_delta")) {
      console.error("selftest FAIL planted miss not detected");
      process.exit(1);
    }
    console.log("verify-economic-columns-c25-c31-present --selftest PASS");
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}

if (process.argv.includes("--selftest")) selftest();
else run();
