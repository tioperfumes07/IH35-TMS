#!/usr/bin/env node
/**
 * EP-UNIT-KIND-SWEEP — ONE generalized guard for silent listUnits unit pickers.
 * Delivery §9.0 item 17: every unit field picker must use EntityPicker kind="unit".
 * Cursor even claim: 2540.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FRONTEND_SRC = path.join(ROOT, "apps/frontend/src");
const LABEL = "verify-entity-picker-unit-kind-sweep";

/** Justified exceptions — documented in PR REMAINING where applicable. */
const ALLOWLIST = new Set([
  // Canonical roster reader for EntityPicker kind=unit.
  "apps/frontend/src/components/parity/entityPickerRegistry.ts",
  // Multi-select covered-units — EntityPicker is single-select only (INS policy create).
  "apps/frontend/src/components/insurance/PolicyCreateModal.tsx",
  "apps/frontend/src/components/insurance/PolicyCreateWizard.tsx",
  // Display-only OOS strip — not a unit field picker.
  "apps/frontend/src/components/dispatch/FleetOosStrip.tsx",
  // Admin linkage table loads units for rows + QBO class mapping (not a unit select).
  "apps/frontend/src/pages/admin/QboVendorLinkagePage.tsx",
  // Trailer roster via listUnits(include:trailers) — not mdata.units unit FK picker.
  "apps/frontend/src/components/banking/TrailerAutocomplete.tsx",
  // Dispatch planner roster aggregation — display only, no unit field picker.
  "apps/frontend/src/pages/dispatch/planners/TruckPlanner.tsx",
]);

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function walkTsFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      walkTsFiles(full, out);
      continue;
    }
    if (!/\.(tsx|ts)$/.test(entry.name)) continue;
    if (/\.(test|spec)\.(tsx|ts)$/.test(entry.name)) continue;
    out.push(full);
  }
  return out;
}

function relFromRoot(abs) {
  return path.relative(ROOT, abs).split(path.sep).join("/");
}

function usesListUnits(code) {
  return /\blistUnits\s*\(/.test(code) || /import[\s\S]*\blistUnits\b[\s\S]*from\s+["'][^"']*mdata["']/.test(code);
}

function hasEntityPickerUnit(code) {
  return /EntityPicker[\s\S]{0,600}kind=["']unit["']/.test(code);
}

function hasSilentUnitPickerPattern(code) {
  if (/\b(Combobox|SelectCombobox)\b/.test(code)) return true;
  if (/UnitAutocomplete/.test(code) && /listUnits\s*\(/.test(code)) return true;
  if (/unitOptions|unitsQuery|unitsQ\b/.test(code) && /listUnits\s*\(/.test(code)) return true;
  if (/<select\b[\s\S]{0,400}\bunits\b[\s\S]{0,200}\.map\s*\(/.test(code)) return true;
  return false;
}

/** @returns {string[]} */
export function collectProblems(root = ROOT) {
  const problems = [];
  if (!fs.existsSync(path.join(root, "apps/frontend/src"))) {
    problems.push("missing apps/frontend/src");
    return problems;
  }

  const files = walkTsFiles(path.join(root, "apps/frontend/src"));
  for (const abs of files) {
    const rel = relFromRoot(abs);
    if (ALLOWLIST.has(rel)) continue;
    const raw = fs.readFileSync(abs, "utf8");
    const code = stripComments(raw);
    if (!usesListUnits(code)) continue;
    if (hasEntityPickerUnit(code)) continue;
    if (!hasSilentUnitPickerPattern(code)) continue;
    problems.push(
      `${rel}: silent unit picker still uses listUnits — migrate to EntityPicker kind="unit" (§9.0 item 17)`
    );
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL: baseline not clean`);
    for (const p of baseline) console.error("  - " + p);
    process.exit(1);
  }

  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-ep-unit-sweep-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/components/example");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "BadUnitPicker.tsx"),
      `import { listUnits } from "../../api/mdata";
import { Combobox } from "../Combobox";
const unitsQuery = listUnits({});
<Combobox options={unitOptions} />
`
    );
    const planted = collectProblems(stubRoot);
    if (!planted.some((p) => p.includes("BadUnitPicker.tsx"))) {
      console.error(`${LABEL} SELFTEST FAIL: planted offender did not FAIL`);
      process.exit(1);
    }
  } finally {
    fs.rmSync(stubRoot, { recursive: true, force: true });
  }
  console.log(`${LABEL} SELFTEST OK`);
} else {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`${LABEL} OK — all unit field pickers use EntityPicker kind=unit (or allowlisted)`);
}
