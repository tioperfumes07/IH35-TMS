#!/usr/bin/env node
/**
 * Book Load equipment — truck EntityPicker + trailer Combobox server search (no silent 500-cap SelectCombobox).
 * Cursor even claim: 2100.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bookload-equipment-entitypicker-search";
const FILE = "apps/frontend/src/pages/dispatch/components/BookLoadEquipmentSection.tsx";

function readRel(root, rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

/** @returns {string[]} */
export function collectProblems(root = ROOT) {
  const problems = [];
  const src = readRel(root, FILE);
  if (!src) {
    problems.push(`missing ${FILE}`);
    return problems;
  }
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  if (!/EntityPicker[\s\S]*?kind=["']unit["']/.test(code) || !/assigned_unit_id/.test(code)) {
    problems.push(`${FILE}: truck unit must use EntityPicker kind=unit`);
  }
  if (!/trailerSearch/.test(code) || !/onSearch=\{setTrailerSearch\}/.test(code)) {
    problems.push(`${FILE}: trailer picker must wire trailerSearch → onSearch`);
  }
  if (!/search:\s*trailerSearch\s*\|\|\s*undefined/.test(code)) {
    problems.push(`${FILE}: trailer listUnits must send search: trailerSearch`);
  }
  if (/SelectCombobox[\s\S]{0,200}assigned_unit_id/.test(code) || /SelectCombobox[\s\S]{0,120}trucks\.map/.test(code)) {
    problems.push(`${FILE}: must not keep SelectCombobox dual path for truck unit`);
  }
  if (/SelectCombobox[\s\S]{0,200}assigned_trailer_unit_id/.test(code) || /SelectCombobox[\s\S]{0,120}trailers\.map/.test(code)) {
    problems.push(`${FILE}: must not keep SelectCombobox dual path for trailer unit`);
  }
  if (/limit:\s*500/.test(code)) {
    problems.push(`${FILE}: must not fetch silent limit:500 fleet page`);
  }

  return problems;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL:`);
    for (const p of baseline) console.error("  - " + p);
    process.exit(1);
  }
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-bookload-equip-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/pages/dispatch/components");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "BookLoadEquipmentSection.tsx"),
      `export function BookLoadEquipmentSection() {
  const unitsQuery = useQuery({ queryFn: () => listUnits({ limit: 500 }) });
  return (
    <>
      <SelectCombobox {...register("assigned_unit_id")}>{trucks.map((u) => <option key={u.id}>{u.label}</option>)}</SelectCombobox>
      <SelectCombobox {...register("assigned_trailer_unit_id")}>{trailers.map((u) => <option key={u.id}>{u.label}</option>)}</SelectCombobox>
    </>
  );
}
`
    );
    const planted = collectProblems(stubRoot);
    if (!planted.some((p) => /EntityPicker/.test(p))) {
      console.error(`${LABEL} SELFTEST FAIL: planted SelectCombobox stub did not FAIL EntityPicker`);
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
  console.log(`${LABEL} OK — BookLoad equipment truck EntityPicker + trailer search`);
}
