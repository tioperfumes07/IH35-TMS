#!/usr/bin/env node
/**
 * Maintenance vendor pickers — RoadServiceTicketModal + PartsInventoryTable must server-search
 * (no silent listVendors limit:1000). Road service unit uses EntityPicker. Cursor even claim: 2106.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-maint-vendor-picker-server-search";
const ROAD = "apps/frontend/src/pages/maintenance/RoadServiceTicketModal.tsx";
const PARTS = "apps/frontend/src/pages/maintenance/components/PartsInventoryTable.tsx";

function readRel(root, rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

/** @returns {string[]} */
export function collectProblems(root = ROOT) {
  const problems = [];
  for (const [file, needUnit] of [
    [ROAD, true],
    [PARTS, false],
  ]) {
    const src = readRel(root, file);
    if (!src) {
      problems.push(`missing ${file}`);
      continue;
    }
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    if (!/vendorSearch/.test(code) || !/onSearch=\{setVendorSearch\}/.test(code)) {
      problems.push(`${file}: must wire vendorSearch → onSearch`);
    }
    if (!/search:\s*vendorSearch\s*\|\|\s*undefined/.test(code)) {
      problems.push(`${file}: listVendors must send search: vendorSearch`);
    }
    if (/limit:\s*1000/.test(code)) {
      problems.push(`${file}: must not fetch silent limit:1000 vendors`);
    }
    if (needUnit && !/EntityPicker[\s\S]*?kind=["']unit["']/.test(code)) {
      problems.push(`${file}: unit must use EntityPicker kind=unit`);
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
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-maint-vendor-search-"));
  try {
    for (const rel of [ROAD, PARTS]) {
      const dir = path.join(stubRoot, path.dirname(rel));
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(stubRoot, rel),
        `export function X() {
  useQuery({ queryFn: () => listVendors({ limit: 1000 }) });
  return <ReferenceSelect createKind="vendor" options={[]} />;
}
`
      );
    }
    const planted = collectProblems(stubRoot);
    if (!planted.some((p) => /vendorSearch|1000/.test(p))) {
      console.error(`${LABEL} SELFTEST FAIL: planted stubs did not FAIL`);
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
  console.log(`${LABEL} OK — RoadService + PartsInventory vendor search`);
}
