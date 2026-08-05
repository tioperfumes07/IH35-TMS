#!/usr/bin/env node
/**
 * ClaimCreateModal — load + trailer EntityPicker migration (canonical mdata.loads / mdata.equipment).
 * Replaces Combobox+listLoads/listUnits silent-cap with shared EntityPicker server search.
 * Cursor even claim: 2414.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-claim-create-entity-picker";
const FILE = "apps/frontend/src/components/insurance/ClaimCreateModal.tsx";
const REGISTRY = "apps/frontend/src/components/parity/entityPickerRegistry.ts";

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

  const loadBlock = code.match(/data-testid="claim-create-load-field"[\s\S]*?<\/label>/)?.[0] ?? "";
  const trailerBlock = code.match(/data-testid="claim-create-trailer-field"[\s\S]*?<\/label>/)?.[0] ?? "";

  if (!/EntityPicker[\s\S]*?kind=["']load["']/.test(loadBlock)) {
    problems.push(`${FILE}: load field must use EntityPicker kind=load inside claim-create-load-field`);
  }
  if (!/allowCreate=\{false\}/.test(loadBlock)) {
    problems.push(`${FILE}: load EntityPicker must set allowCreate={false} (loads are transactions)`);
  }
  if (!/nestedInDrawer/.test(loadBlock)) {
    problems.push(`${FILE}: load EntityPicker must set nestedInDrawer (ParityDrawer shell)`);
  }

  if (!/EntityPicker[\s\S]*?kind=["']trailer["']/.test(trailerBlock)) {
    problems.push(`${FILE}: trailer field must use EntityPicker kind=trailer inside claim-create-trailer-field`);
  }
  if (!/nestedInDrawer/.test(trailerBlock)) {
    problems.push(`${FILE}: trailer EntityPicker must set nestedInDrawer (ParityDrawer shell)`);
  }

  if (/CreateTrailerModal/.test(src)) {
    problems.push(`${FILE}: trailer inline create must flow through EntityPicker, not a side-channel CreateTrailerModal`);
  }
  if (/listLoads\(|listUnits\(/.test(code)) {
    problems.push(`${FILE}: must not duplicate roster fetch — EntityPicker owns listLoads/listEquipment`);
  }

  const registry = readRel(root, REGISTRY);
  if (!registry) {
    problems.push(`missing ${REGISTRY}`);
  } else {
    const trailerCfg = registry.split("trailer:")[1]?.split("\n  unit:")[0] ?? "";
    if (!/readTable:\s*"mdata\.equipment"/.test(trailerCfg)) {
      problems.push(`${REGISTRY}: trailer kind must read mdata.equipment (insurance.claim.trailer_id FK)`);
    }
    const loadCfg = registry.split("load:")[1]?.split("\n  vendor:")[0] ?? "";
    if (!/serverSearch:\s*true/.test(loadCfg)) {
      problems.push(`${REGISTRY}: load kind must declare serverSearch: true`);
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
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-claim-create-ep-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/components/insurance");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "ClaimCreateModal.tsx"),
      `import { CreateTrailerModal } from "../fleet/CreateTrailerModal";
listLoads({ limit: 200 })
<label data-testid="claim-create-load-field"><Combobox onSearch={setLoadSearch} /></label>
<label data-testid="claim-create-trailer-field"><Combobox allowAddNew /></label>
<EntityPicker kind="unit" />
`
    );
    const regDir = path.join(stubRoot, "apps/frontend/src/components/parity");
    fs.mkdirSync(regDir, { recursive: true });
    fs.writeFileSync(
      path.join(regDir, "entityPickerRegistry.ts"),
      `const ENTITY_PICKERS = {
  trailer: { readTable: "mdata.units", writeTable: "mdata.units", serverSearch: true },
  load: { readTable: "mdata.loads", writeTable: "mdata.loads", serverSearch: false },
};`
    );
    const planted = collectProblems(stubRoot);
    if (!planted.some((p) => /EntityPicker kind=load/.test(p) || /CreateTrailerModal/.test(p) || /mdata\.equipment/.test(p))) {
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
  console.log(`${LABEL} OK — ClaimCreate load/trailer EntityPicker → mdata.loads / mdata.equipment`);
}
