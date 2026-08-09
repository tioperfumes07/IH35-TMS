#!/usr/bin/env node
/**
 * EP-DRIVER-KIND-SWEEP — ONE generalized guard for silent listDrivers driver pickers.
 * Delivery §9.0 item 17: every driver field picker must use EntityPicker kind="driver"
 * (or the thin DriverPickerWithCreate / DriverAutocomplete wrappers).
 * Cursor even claim: 2550.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-entity-picker-driver-kind-sweep";

/** Justified exceptions — documented in PR REMAINING where applicable. */
const ALLOWLIST = new Set([
  // Canonical roster reader for EntityPicker kind=driver.
  "apps/frontend/src/components/parity/entityPickerRegistry.ts",
  // Drivers module roster pages — display/table, not a driver FK field picker.
  "apps/frontend/src/pages/drivers/DriversListPage.tsx",
  "apps/frontend/src/pages/Drivers.tsx",
  // Safety dashboard cards — read-only roster aggregation, not a picker.
  "apps/frontend/src/components/safety/DriverSafetyCards.tsx",
  // HOS page bulk-loads drivers for dashboard rows — not a combobox picker.
  "apps/frontend/src/pages/safety/HoursOfServicePage.tsx",
  // Inline assign chrome already uses EntityPicker kind=driver.
  "apps/frontend/src/components/dispatch/InlineDriverPicker.tsx",
  // Admin linkage table — not a driver select field.
  "apps/frontend/src/pages/admin/QboVendorLinkagePage.tsx",
  // Drug/alcohol tab count probe (limit:1) — not a roster picker.
  "apps/frontend/src/pages/safety/tabs/DrugAlcoholTab.tsx",
  // Maintenance master-data admin table — not a driver FK picker.
  "apps/frontend/src/pages/maintenance/drivers/DriversMasterDataPage.tsx",
  // Load-assignment picker: uses dispatch-specific available-drivers endpoint with HOS/distance,
  // not the generic listDrivers roster. Approved wrapper would lose load-aware HOS/distance sorting.
  "apps/frontend/src/pages/dispatch/AssignDriverDropdown.tsx",
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

function usesListDrivers(code) {
  return /\blistDrivers\s*\(/.test(code) || /import[\s\S]*\blistDrivers\b[\s\S]*from\s+["'][^"']*mdata["']/.test(code);
}

function hasEntityPickerDriver(code) {
  return /EntityPicker[\s\S]{0,600}kind=["']driver["']/.test(code);
}

function hasApprovedDriverPickerWrapper(code) {
  return /DriverPickerWithCreate/.test(code) || /DriverAutocomplete/.test(code);
}

function hasSilentDriverPickerPattern(code) {
  if (/\b(Combobox|SelectCombobox)\b/.test(code)) return true;
  if (/DriverAutocomplete/.test(code) && /listDrivers\s*\(/.test(code)) return true;
  if (/driverOptions|driversQuery|driversQ\b/.test(code) && /listDrivers\s*\(/.test(code)) return true;
  if (/<select\b[\s\S]{0,400}\bdrivers\b[\s\S]{0,200}\.map\s*\(/.test(code)) return true;
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
    if (!usesListDrivers(code)) continue;
    if (hasEntityPickerDriver(code)) continue;
    if (hasApprovedDriverPickerWrapper(code) && !hasSilentDriverPickerPattern(code)) continue;
    if (!hasSilentDriverPickerPattern(code)) continue;
    problems.push(
      `${rel}: silent driver picker still uses listDrivers — migrate to EntityPicker kind="driver" (§9.0 item 17)`
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

  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-ep-driver-sweep-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/components/example");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "BadDriverPicker.tsx"),
      `import { listDrivers } from "../../api/mdata";
import { Combobox } from "../Combobox";
const driversQuery = listDrivers({});
<Combobox options={driverOptions} />
`
    );
    const planted = collectProblems(stubRoot);
    if (!planted.some((p) => p.includes("BadDriverPicker.tsx"))) {
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
  console.log(`${LABEL} OK — all driver field pickers use EntityPicker kind=driver (or allowlisted)`);
}
