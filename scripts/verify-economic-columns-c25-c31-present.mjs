#!/usr/bin/env node
/**
 * C25–C31 must be REQUIRED BY EVERY URGENT-16 MODULE, not merely declared in columns.shared.json.
 * Closed-loop (shared.json vs shared.json) printed OK while dispatch matrix had zero ECON columns.
 * Shape-independent: recursive string scan. Completeness discriminator fails empty/missing scope.
 * Catalog parity: a 17th URGENT_16_MODULE_IDS entry without a required.json fails closed.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODULES_DIR = path.join(ROOT, "docs/specs/scoreboard/modules");
const SHARED = path.join(ROOT, "docs/specs/scoreboard/columns.shared.json");
const CATALOG = path.join(ROOT, "apps/frontend/src/pages/program/moduleMatrixCatalog.ts");
const MATRIX_VIEW = path.join(ROOT, "apps/frontend/src/pages/program/ModuleMatrixSystemView.tsx");

const ECON = [
  "gl_delta",
  "subledger_tie",
  "lifecycle_complete",
  "reversal_symmetry",
  "period_guard",
  "entity_isolation",
  "non_empty_proof",
];

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

function strings(node, out = new Set()) {
  if (typeof node === "string") out.add(node);
  else if (Array.isArray(node)) for (const v of node) strings(v, out);
  else if (node && typeof node === "object") for (const v of Object.values(node)) strings(v, out);
  return out;
}

function idsIn(file) {
  return strings(JSON.parse(fs.readFileSync(file, "utf8")));
}

function catalogUrgent16Ids() {
  const t = fs.readFileSync(CATALOG, "utf8");
  const m = t.match(/export const URGENT_16_MODULE_IDS[\s\S]*?\]\s*as const/);
  if (!m) return [];
  return [...m[0].matchAll(/"([a-z0-9-]+)"/g)].map((x) => x[1]);
}

export function check(modulesDir = MODULES_DIR) {
  const failures = [];

  const declared = new Set((JSON.parse(fs.readFileSync(SHARED, "utf8")).columns || []).map((c) => c.id));
  for (const id of ECON) if (!declared.has(id)) failures.push(`columns.shared.json missing ${id}`);

  if (!fs.existsSync(MATRIX_VIEW)) {
    failures.push("ModuleMatrixSystemView.tsx missing — C25–C31 cannot be drawn");
  } else {
    const viewSrc = fs.readFileSync(MATRIX_VIEW, "utf8");
    for (const id of ECON) {
      const re = new RegExp(`(^|[^A-Za-z0-9_])${id}([^A-Za-z0-9_]|$)`);
      if (!re.test(viewSrc)) {
        failures.push(`ModuleMatrixSystemView.tsx does not contain ${id} (word boundary) — declared columns must be drawn`);
      }
    }
  }

  const catIds = catalogUrgent16Ids();
  if (catIds.length === 0) failures.push("URGENT_16_MODULE_IDS unreadable in moduleMatrixCatalog.ts");
  const catSet = new Set(catIds);
  const hardSet = new Set(URGENT_16);
  for (const id of catIds) {
    if (!hardSet.has(id)) {
      failures.push(`catalog has ${id} but this guard's URGENT_16 list does not — update both + add ${id}.required.json`);
    }
  }
  for (const id of URGENT_16) {
    if (catIds.length && !catSet.has(id)) failures.push(`URGENT_16 list has ${id} missing from moduleMatrixCatalog.ts`);
  }

  const present = URGENT_16.filter((m) => fs.existsSync(path.join(modulesDir, `${m}.required.json`)));
  if (present.length !== URGENT_16.length) {
    failures.push(
      `scope incomplete: ${present.length}/${URGENT_16.length} urgent-16 module specs found — missing ${URGENT_16.filter((m) => !present.includes(m)).join(",")}`,
    );
  }
  if (present.length === 0) failures.push("no module specs readable — this guard cannot see what it checks");

  for (const m of present) {
    const have = idsIn(path.join(modulesDir, `${m}.required.json`));
    const missing = ECON.filter((id) => !have.has(id));
    if (missing.length) failures.push(`${m}.required.json does not require: ${missing.join(",")}`);
    if (!have.has("economics.invariants")) failures.push(`${m}.required.json missing economics.invariants leaf id`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".econ-selftest-"));
  try {
    for (const m of URGENT_16) {
      fs.copyFileSync(path.join(MODULES_DIR, `${m}.required.json`), path.join(tmp, `${m}.required.json`));
    }
    const victim = path.join(tmp, "dispatch.required.json");
    fs.writeFileSync(victim, fs.readFileSync(victim, "utf8").split('"gl_delta"').join('"gl_delta_PLANTED"'));
    const found = check(tmp);
    if (!found.some((f) => f.startsWith("dispatch.required.json"))) {
      console.error("selftest FAIL — planted removal of dispatch gl_delta was NOT detected");
      process.exit(1);
    }
    console.log("verify-economic-columns-c25-c31-present --selftest PASS");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
} else {
  const failures = check();
  if (failures.length) {
    console.error("verify-economic-columns-c25-c31-present FAIL");
    for (const f of failures) console.error(` - ${f}`);
    process.exit(1);
  }
  console.log(
    `verify-economic-columns-c25-c31-present OK — all 7 econ columns required by all ${URGENT_16.length} urgent-16 modules`,
  );
}
