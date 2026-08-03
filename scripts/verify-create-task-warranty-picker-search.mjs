#!/usr/bin/env node
/**
 * CreateTaskModal + WarrantyClaimsPage — server search / EntityPicker for entity links;
 * no silent native <select> over limit:1000/5000 pages. Cursor even claim: 2108.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-create-task-warranty-picker-search";
const TASK = "apps/frontend/src/components/tasks/CreateTaskModal.tsx";
const WARRANTY = "apps/frontend/src/pages/maintenance/WarrantyClaimsPage.tsx";

function readRel(root, rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

/** @returns {string[]} */
export function collectProblems(root = ROOT) {
  const problems = [];

  const task = readRel(root, TASK);
  if (!task) {
    problems.push(`missing ${TASK}`);
  } else {
    const code = task.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    if (!/EntityPicker/.test(code)) {
      problems.push(`${TASK}: must use EntityPicker for vendor/driver/unit links`);
    }
    if (!/createKind=["']customer["']/.test(code) || !/onSearch=\{setCustomerSearch\}/.test(code)) {
      problems.push(`${TASK}: customer link must use ReferenceSelect + customerSearch`);
    }
    if (/listVendors\s*\(/.test(code) || /listDrivers\s*\(/.test(code) || /listUnits\s*\(/.test(code)) {
      problems.push(`${TASK}: must not bulk listVendors/listDrivers/listUnits for entity link`);
    }
    if (/entityOptions\.map/.test(code) && /<option key=\{o\.id\}/.test(code)) {
      problems.push(`${TASK}: must not render native <select> over entityOptions`);
    }
  }

  const warranty = readRel(root, WARRANTY);
  if (!warranty) {
    problems.push(`missing ${WARRANTY}`);
  } else {
    const code = warranty.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    if (!/vendorSearch/.test(code) || !/onSearch=\{setVendorSearch\}/.test(code)) {
      problems.push(`${WARRANTY}: vendor ReferenceSelect must wire vendorSearch`);
    }
    if (!/createKind=["']vendor["']/.test(code)) {
      problems.push(`${WARRANTY}: vendor picker must keep createKind=vendor`);
    }
    if (/listVendors\([\s\S]*?limit:\s*1000\s*\)/.test(code) && !/vendorSearch/.test(code)) {
      problems.push(`${WARRANTY}: must not keep silent limit:1000 without search`);
    }
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
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-task-warranty-"));
  try {
    const taskDir = path.join(stubRoot, "apps/frontend/src/components/tasks");
    const warDir = path.join(stubRoot, "apps/frontend/src/pages/maintenance");
    fs.mkdirSync(taskDir, { recursive: true });
    fs.mkdirSync(warDir, { recursive: true });
    fs.writeFileSync(
      path.join(taskDir, "CreateTaskModal.tsx"),
      `import { listVendors, listDrivers, listUnits } from "../../api/mdata";
const vendorsQuery = useQuery({ queryFn: () => listVendors({ limit: 1000 }) });
{entityOptions.map((o) => (<option key={o.id} value={o.id}>{o.label}</option>))}
`
    );
    fs.writeFileSync(
      path.join(warDir, "WarrantyClaimsPage.tsx"),
      `listVendors({ operating_company_id: companyId, status: "active", limit: 1000 })
<ReferenceSelect createKind="vendor" options={vendorOptions} />
`
    );
    const planted = collectProblems(stubRoot);
    if (planted.length < 2) {
      console.error(`${LABEL} SELFTEST FAIL: planted stub did not FAIL enough (${planted.length})`);
      for (const p of planted) console.error("  - " + p);
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
  console.log(`${LABEL} OK — CreateTask + WarrantyClaims picker search`);
}
