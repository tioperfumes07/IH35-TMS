#!/usr/bin/env node
/**
 * CreateWOSectionIdentification — unit EntityPicker + vendor/customer server search;
 * no listDrivers(limit:500) / listVendors(limit:1000) silent pages. Cursor even claim: 2104.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-createwo-identification-picker-search";
const FILE = "apps/frontend/src/pages/maintenance/components/CreateWOSectionIdentification.tsx";

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

  if (!/EntityPicker[\s\S]*?kind=["']unit["']/.test(code)) {
    problems.push(`${FILE}: unit must use EntityPicker kind=unit`);
  }
  if (!/vendorSearch/.test(code) || !/onSearch=\{setVendorSearch\}/.test(code)) {
    problems.push(`${FILE}: vendor ReferenceSelect must wire vendorSearch`);
  }
  if (!/customerSearch/.test(code) || !/onSearch=\{setCustomerSearch\}/.test(code)) {
    problems.push(`${FILE}: customer ReferenceSelect must wire customerSearch`);
  }
  if (/listDrivers\s*\(/.test(code)) {
    problems.push(`${FILE}: must not bulk listDrivers for class hint`);
  }
  if (/limit:\s*1000/.test(code) || /limit:\s*5000/.test(code) || /limit:\s*500/.test(code)) {
    problems.push(`${FILE}: must not fetch silent 500/1000/5000 pages`);
  }
  if (!/getDriver\(/.test(code)) {
    problems.push(`${FILE}: class hint must getDriver for selected driver`);
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
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-createwo-id-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/pages/maintenance/components");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "CreateWOSectionIdentification.tsx"),
      `import { listDrivers, listVendors } from "../../../api/mdata";
const driversQuery = useQuery({ queryFn: () => listDrivers({ limit: 500 }) });
const vendorsQuery = useQuery({ queryFn: () => listVendors({ limit: 1000 }) });
export function X() { return <Combobox options={vehicleOptions} />; }
`
    );
    const planted = collectProblems(stubRoot);
    if (!planted.some((p) => /EntityPicker|listDrivers|1000/.test(p))) {
      console.error(`${LABEL} SELFTEST FAIL: planted stub did not FAIL`);
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
  console.log(`${LABEL} OK — CreateWO identification pickers search`);
}
