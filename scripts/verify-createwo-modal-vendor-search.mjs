#!/usr/bin/env node
/**
 * CreateWorkOrderModal outside-vendor ReferenceSelect server search. Cursor even claim: 2112.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-createwo-modal-vendor-search";
const FILE = "apps/frontend/src/pages/maintenance/components/CreateWorkOrderModal.tsx";

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
  if (!/vendorSearch/.test(code) || !/onSearch=\{setVendorSearch\}/.test(code)) {
    problems.push(`${FILE}: outside-vendor ReferenceSelect must wire vendorSearch`);
  }
  if (!/createKind=["']vendor["']/.test(code)) {
    problems.push(`${FILE}: must keep createKind=vendor`);
  }
  if (/listVendors\(\{[^}]*limit:\s*1000\s*\}\)/.test(code) && !/vendorSearch/.test(code)) {
    problems.push(`${FILE}: must not keep silent limit:1000 without search`);
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
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-createwo-vendor-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/pages/maintenance/components");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "CreateWorkOrderModal.tsx"),
      `listVendors({ operating_company_id: id, status: "active", limit: 1000 })
<ReferenceSelect createKind="vendor" options={vendorOptions} />
`
    );
    const planted = collectProblems(stubRoot);
    if (!planted.length) {
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
  console.log(`${LABEL} OK — CreateWO modal vendor search`);
}
