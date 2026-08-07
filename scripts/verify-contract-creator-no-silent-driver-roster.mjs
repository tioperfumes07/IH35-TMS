#!/usr/bin/env node
/**
 * CLS-SILENT-CAP — UnifiedContractCreatorModal must not bulk-fetch listDrivers(limit:200)
 * for signer hydration while DriverPickerWithCreate already server-searches the picker.
 * Signer contact fields hydrate via getDriver(id) per selection instead.
 * Cursor even claim: 2312.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-contract-creator-no-silent-driver-roster";
const FILE = "apps/frontend/src/pages/legal/contracts/UnifiedContractCreatorModal.tsx";

function readRel(root, rel) {
  const p = path.join(root, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
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

  if (!/DriverPickerWithCreate/.test(src)) {
    problems.push(`${FILE}: driver signer must use DriverPickerWithCreate (server-search picker)`);
  }
  if (/listDrivers\s*\(/.test(code)) {
    problems.push(`${FILE}: must not call listDrivers — silent roster cap; use getDriver per selection`);
  }
  if (!/getDriver\s*\(/.test(code)) {
    problems.push(`${FILE}: must hydrate signer contact via getDriver(id, operatingCompanyId)`);
  }
  if (/driversQuery/.test(code)) {
    problems.push(`${FILE}: must not keep a bulk driversQuery roster cache`);
  }

  return problems;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL (baseline not green):`);
    for (const p of baseline) console.error("  - " + p);
    process.exit(1);
  }

  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-contract-silent-cap-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/pages/legal/contracts");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "UnifiedContractCreatorModal.tsx"),
      `
const driversQuery = useQuery({
  queryFn: () => listDrivers({ operating_company_id: operatingCompanyId, limit: 200 }),
});
<DriverPickerWithCreate onChange={(id) => {
  const cached = driversQuery.data?.drivers?.find((row) => row.id === id);
}} />
`
    );
    const planted = collectProblems(stubRoot);
    if (!planted.length) {
      console.error(`${LABEL} SELFTEST FAIL: planted silent roster did not FAIL`);
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
  console.log(`${LABEL} OK — contract creator uses getDriver hydration (no silent driver roster)`);
}
