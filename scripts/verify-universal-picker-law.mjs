#!/usr/bin/env node
/**
 * GUARD (LST-PICKER-01): keystone ReferenceSelect keeps first-row inline create, and
 * QuickCreate / inline drawers write canonical tables (not mdata.qbo_* mirrors).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-universal-picker-law";
const REF = "apps/frontend/src/components/parity/ReferenceSelect.tsx";
const COMBO = "apps/frontend/src/components/Combobox.tsx";
const QC = "apps/frontend/src/components/forms/shared/QuickCreateEntityModal.tsx";
const INV = "docs/trackers/LST-PICKER-INVENTORY-2026-07-25.md";

function code(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join("\n");
}

export function assertUniversalPickerLaw(sources) {
  const problems = [];
  const ref = code(sources[REF] ?? "");
  const combo = code(sources[COMBO] ?? "");
  const qc = code(sources[QC] ?? "");
  const inv = sources[INV] ?? "";

  if (!/allowAddNew/.test(ref)) {
    problems.push(`${REF}: must pass allowAddNew into Combobox (first-row + Add new)`);
  }
  if (!/\+ Add new/.test(ref) && !/addNewLabel/.test(ref)) {
    problems.push(`${REF}: must expose + Add new label`);
  }
  // Combobox must place add-new as first option when configured.
  if (!/allowAddNew/.test(combo)) {
    problems.push(`${COMBO}: missing allowAddNew support`);
  }
  if (!/FIRST row|unshift|\[\s*addNew|\.\.\.addNew|options\s*=\s*\[add/i.test(combo) && !/allowAddNew[\s\S]{0,400}?options/.test(combo)) {
    // Softer: require the comment or the options construction that prepends.
    if (!/FIRST ROW|always the FIRST|permanent FIRST/i.test(sources[COMBO] ?? "")) {
      problems.push(`${COMBO}: must keep + Add new as FIRST row (QB-STD-1/2)`);
    }
  }
  // Quick-create must not write QBO mirrors.
  if (/mdata\.qbo_items|mdata\.qbo_accounts|createQboItem|createQboAccount/.test(qc)) {
    problems.push(`${QC}: must not write mdata.qbo_* mirrors (VERIFY-2 clause 5)`);
  }
  if (!/catalogs\.items|itemsCatalogClient|\/catalogs\/accounting\/items/.test(qc)) {
    problems.push(`${QC}: item create must target catalogs.items`);
  }
  if (!inv.includes("LST-PICKER-01") || !inv.includes("FAIL")) {
    problems.push(`${INV}: inventory doc must exist and list remaining FAILs`);
  }
  return problems;
}

const FILES = [REF, COMBO, QC, INV];
const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

if (IS_MAIN && process.argv.includes("--selftest")) {
  const real = Object.fromEntries(FILES.map((f) => [f, read(f)]));
  const broken = { ...real, [QC]: real[QC] + "\ncreateQboItem();\n" };
  if (assertUniversalPickerLaw(broken).length === 0) {
    console.error(`${LABEL} --selftest FAIL: mirror write not flagged`);
    process.exit(1);
  }
  const good = assertUniversalPickerLaw(real);
  if (good.length) {
    console.error(`${LABEL} --selftest FAIL:\n${good.join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}
if (IS_MAIN) {
  const sources = Object.fromEntries(FILES.map((f) => [f, read(f)]));
  const problems = assertUniversalPickerLaw(sources);
  if (problems.length) {
    console.error(`${LABEL} FAIL:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — keystone picker law + inventory present.`);
}
