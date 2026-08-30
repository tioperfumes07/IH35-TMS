#!/usr/bin/env node
/**
 * C25–C31 must be REQUIRED BY EVERY URGENT-16 MODULE, not merely declared in columns.shared.json.
 * Closed-loop (shared.json vs shared.json) printed OK while dispatch matrix had zero ECON columns.
 * Shape-independent: recursive string scan. Completeness discriminator fails empty/missing scope.
 * Catalog parity: a 17th URGENT_16_MODULE_IDS entry without a required.json fails closed.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODULES_DIR = path.join(ROOT, "docs/specs/scoreboard/modules");
const SHARED = path.join(ROOT, "docs/specs/scoreboard/columns.shared.json");
const ECONOMIC = path.join(ROOT, "docs/specs/scoreboard/columns.economic.json");
const CATALOG = path.join(ROOT, "apps/frontend/src/pages/program/moduleMatrixCatalog.ts");
const MATRIX_VIEW = path.join(ROOT, "apps/frontend/src/pages/program/ModuleMatrixSystemView.tsx");
const MATRIX_SVC = path.join(ROOT, "apps/backend/src/program/module-matrix.service.ts");
const FAIL_UNIQUE = {
  gl_delta: true,
  subledger_tie: true,
  lifecycle_complete: true,
  reversal_symmetry: false,
  period_guard: true,
  entity_isolation: true,
  non_empty_proof: false,
};

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

  const sharedDoc = JSON.parse(fs.readFileSync(SHARED, "utf8"));
  const econDoc = JSON.parse(fs.readFileSync(ECONOMIC, "utf8"));
  const declared = new Set((sharedDoc.columns || []).map((c) => c.id));
  for (const id of ECON) if (!declared.has(id)) failures.push(`columns.shared.json missing ${id}`);

  const sharedById = Object.fromEntries((sharedDoc.columns || []).map((c) => [c.id, c]));
  const econById = Object.fromEntries((econDoc.columns || []).map((c) => [c.id, c]));
  for (const id of ECON) {
    const s = sharedById[id];
    const e = econById[id];
    if (!e) {
      failures.push(`columns.economic.json missing ${id}`);
      continue;
    }
    if (!s) continue;
    if (s.acceptance) failures.push(`${id} still has morning acceptance field — VOID; merge economic.json proves`);
    if (s.owner_status) failures.push(`${id} still has morning owner_status — VOID`);
    for (const k of ["proves", "evidence", "auto_check", "fail_is_unique"]) {
      if (s[k] === undefined) failures.push(`columns.shared.json ${id} missing ${k} (inert-definition class)`);
    }
    if (s.proves !== e.proves) failures.push(`${id} proves drifted from columns.economic.json`);
    if (s.evidence !== e.evidence) failures.push(`${id} evidence drifted from columns.economic.json`);
    if (s.auto_check !== e.auto_check) failures.push(`${id} auto_check drifted from columns.economic.json`);
    if (s.fail_is_unique !== e.fail_is_unique) failures.push(`${id} fail_is_unique drifted`);
    if (s.fail_is_unique !== FAIL_UNIQUE[id]) failures.push(`${id} fail_is_unique must be ${FAIL_UNIQUE[id]}`);
    const script = path.join(ROOT, "scripts", e.auto_check);
    if (!fs.existsSync(script)) failures.push(`auto_check missing ${e.auto_check}`);
    else {
      const st = spawnSync(process.execPath, [script, "--selftest"], { encoding: "utf8" });
      if (st.status !== 0) {
        failures.push(`${e.auto_check} --selftest failed: ${(st.stderr || st.stdout || "").slice(0, 200)}`);
      }
    }
  }

  const proofsPath = path.join(ROOT, "docs/specs/scoreboard/economics.proofs.json");
  if (!fs.existsSync(proofsPath)) {
    failures.push("economics.proofs.json missing — econ cells unbound to Bar 3");
  } else {
    const proofsDoc = JSON.parse(fs.readFileSync(proofsPath, "utf8"));
    const byCol = Object.fromEntries((proofsDoc.items || []).map((it) => [it.column, it]));
    for (const id of ECON) {
      const it = byCol[id];
      if (!it) {
        failures.push(`economics.proofs.json missing column ${id}`);
        continue;
      }
      const p0 = (it.proofs || [])[0];
      if (!p0 || p0.kind !== "sql") failures.push(`${id} proofs[0] must be kind sql (not ledger prose)`);
      if (p0 && p0.file !== "scripts/verify-gl-invariants.sql") {
        failures.push(`${id} sql file must be allowlisted verify-gl-invariants.sql`);
      }
      if (p0 && !p0.query_id) failures.push(`${id} sql proof missing query_id (R3)`);
      if (p0 && !p0.probe_query_id) failures.push(`${id} sql proof missing probe_query_id (R1-b)`);
      if (p0 && (!p0.discriminator || p0.discriminator.column !== "je_control")) {
        failures.push(`${id} sql proof missing je_control discriminator (R1)`);
      }
    }
  }

  const invSql = fs.readFileSync(path.join(ROOT, "scripts/verify-gl-invariants.sql"), "utf8");
  if (!invSql.includes("=== INV-0")) {
    failures.push("verify-gl-invariants.sql missing INV-0 CONTROL — zero-row proofs cannot distinguish blind RLS from clean");
  }
  for (const rel of [
    "scripts/proof-engine/sql-runner.mjs",
    "scripts/proof-engine/sql-runner.selftest.mjs",
    "scripts/proof-engine/econ-proofs.mjs",
    "scripts/verify-no-closed-loop-guards.mjs",
  ]) {
    if (!fs.existsSync(path.join(ROOT, rel))) failures.push(`HIGH-BAR instrument missing ${rel}`);
  }

  const sqlSt = spawnSync(process.execPath, [path.join(ROOT, "scripts/proof-engine/sql-runner.selftest.mjs")], {
    encoding: "utf8",
  });
  if (sqlSt.status !== 0) {
    failures.push(`sql-runner.selftest failed: ${(sqlSt.stderr || sqlSt.stdout || "").slice(0, 240)}`);
  }
  const loopSt = spawnSync(
    process.execPath,
    [path.join(ROOT, "scripts/verify-no-closed-loop-guards.mjs"), "--selftest"],
    { encoding: "utf8" },
  );
  if (loopSt.status !== 0) {
    failures.push(`verify-no-closed-loop-guards --selftest failed: ${(loopSt.stderr || loopSt.stdout || "").slice(0, 240)}`);
  }

  const svc = fs.existsSync(MATRIX_SVC) ? fs.readFileSync(MATRIX_SVC, "utf8") : "";
  if (!svc.includes("ECONOMICS_LIVE_FORBIDS_LEDGER_PROSE")) {
    failures.push("module-matrix.service.ts missing ECONOMICS_LIVE_FORBIDS_LEDGER_PROSE — prose LIVE path still open");
  }
  if (!svc.includes("isEconomicsMatrixColumn")) {
    failures.push("module-matrix.service.ts missing isEconomicsMatrixColumn");
  }

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
