#!/usr/bin/env node
/**
 * §9.0 item 17 — systemic trailer picker sweep: every trailer FK control must use EntityPicker
 * kind=trailer (listEquipment / mdata.equipment + inline create), not TrailerAutocomplete /
 * listUnits(include:"trailers") shims. Cursor even claim: 2554.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-entity-picker-trailer-kind-sweep";

const SURFACES = [
  "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx",
  "apps/frontend/src/pages/banking/components/BankTransactionSplitModal.tsx",
];

// insurance.policy_unit.asset_id resolves mdata.units -> mdata.assets. Trailers are linked on
// insurance.claim.trailer_id instead, so policy creators must never widen their unit roster with
// include:"trailers" (an equipment id cannot resolve through resolveMdataAssetId).
const POLICY_UNIT_SURFACES = [
  "apps/frontend/src/components/insurance/PolicyCreateModal.tsx",
  "apps/frontend/src/components/insurance/PolicyCreateWizard.tsx",
];

const BANNED_FILE = "apps/frontend/src/components/banking/TrailerAutocomplete.tsx";

/** listUnits(include:trailers) allowed only for fleet roster tables — not pickers. */
const INCLUDE_TRAILERS_ALLOW = new Set([
  "apps/frontend/src/pages/maintenance/FleetTablePage.tsx",
]);

function readRel(root, rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function walkTsx(dir, out = []) {
  for (const e of fs.readdirSync(dir)) {
    if (e === "node_modules" || e.startsWith(".")) continue;
    const full = path.join(dir, e);
    if (fs.statSync(full).isDirectory()) walkTsx(full, out);
    else if (/\.tsx?$/.test(e) && !/\.(test|spec)\./.test(e)) out.push(full);
  }
  return out;
}

/** @returns {string[]} */
export function collectProblems(root = ROOT) {
  const problems = [];

  if (fs.existsSync(path.join(root, BANNED_FILE))) {
    problems.push(`${BANNED_FILE}: TrailerAutocomplete shim must be deleted — use EntityPicker kind=trailer`);
  }

  const registry = readRel(root, "apps/frontend/src/components/parity/entityPickerRegistry.ts");
  if (!registry) {
    problems.push("missing entityPickerRegistry.ts");
  } else {
    const regCode = stripComments(registry);
    if (!/\btrailer:\s*\{/.test(regCode)) {
      problems.push("entityPickerRegistry: must declare trailer kind");
    }
    if (!/readTable:\s*"mdata\.equipment"/.test(regCode) || !/writeTable:\s*"mdata\.equipment"/.test(regCode)) {
      problems.push("entityPickerRegistry: trailer kind must read/write mdata.equipment");
    }
    if (!/listEquipment\(/.test(regCode)) {
      problems.push("entityPickerRegistry: trailer list must call listEquipment");
    }
  }

  for (const rel of SURFACES) {
    const src = readRel(root, rel);
    if (!src) {
      problems.push(`missing ${rel}`);
      continue;
    }
    const code = stripComments(src);
    if (!/EntityPicker[\s\S]*?kind=["']trailer["']/.test(code)) {
      problems.push(`${rel}: trailer field must use EntityPicker kind=trailer`);
    }
    if (/TrailerAutocomplete/.test(src)) {
      problems.push(`${rel}: must not import TrailerAutocomplete`);
    }
    if (/include:\s*["']trailers["']/.test(code)) {
      problems.push(`${rel}: must not use listUnits(include:trailers) — EntityPicker kind=trailer`);
    }
  }

  for (const rel of POLICY_UNIT_SURFACES) {
    const src = readRel(root, rel);
    if (!src) {
      problems.push(`missing ${rel}`);
      continue;
    }
    const code = stripComments(src);
    if (!/EntityPicker[\s\S]*?kind=["']unit["']/.test(code)) {
      problems.push(`${rel}: covered policy assets must use EntityPicker kind=unit`);
    }
    if (/include:\s*["']trailers["']/.test(code)) {
      problems.push(`${rel}: insurance.policy_unit cannot accept mdata.equipment ids`);
    }
  }

  const feRoot = path.join(root, "apps/frontend/src");
  if (fs.existsSync(feRoot)) {
    for (const abs of walkTsx(feRoot)) {
      const rel = path.relative(root, abs);
      const src = fs.readFileSync(abs, "utf8");
      if (/TrailerAutocomplete/.test(src)) {
        problems.push(`${rel}: TrailerAutocomplete banned — EntityPicker kind=trailer`);
      }
      const code = stripComments(src);
      if (INCLUDE_TRAILERS_ALLOW.has(rel)) continue;
      if (/include:\s*["']trailers["']/.test(code) && /Combobox|Autocomplete|select|Picker/.test(code)) {
        problems.push(`${rel}: picker must not use listUnits(include:trailers) — EntityPicker kind=trailer`);
      }
    }
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
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-ep-trailer-sweep-"));
  try {
    const regDir = path.join(stubRoot, "apps/frontend/src/components/parity");
    fs.mkdirSync(regDir, { recursive: true });
    fs.writeFileSync(
      path.join(regDir, "entityPickerRegistry.ts"),
      `export const ENTITY_PICKERS = { unit: { readTable: "mdata.units", writeTable: "mdata.units", list: async () => [] } };`
    );
    fs.mkdirSync(path.join(stubRoot, "apps/frontend/src/pages/banking/components"), { recursive: true });
    fs.writeFileSync(
      path.join(stubRoot, "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx"),
      `import { TrailerAutocomplete } from "../../../components/banking/TrailerAutocomplete";
listUnits({ include: "trailers", limit: 500 })
<TrailerAutocomplete companyId={id} value="" onChange={() => {}} />`
    );
    fs.writeFileSync(
      path.join(stubRoot, "apps/frontend/src/pages/banking/components/BankTransactionSplitModal.tsx"),
      `include: "trailers"`
    );
    fs.mkdirSync(path.join(stubRoot, "apps/frontend/src/components/banking"), { recursive: true });
    fs.writeFileSync(path.join(stubRoot, "apps/frontend/src/components/banking/TrailerAutocomplete.tsx"), "export {}");
    fs.mkdirSync(path.join(stubRoot, "apps/frontend/src/components/insurance"), { recursive: true });
    for (const file of ["PolicyCreateModal.tsx", "PolicyCreateWizard.tsx"]) {
      fs.writeFileSync(
        path.join(stubRoot, "apps/frontend/src/components/insurance", file),
        `listAllUnits({ include: "trailers" })\n<EntityPicker kind="trailer" />`,
      );
    }
    const planted = collectProblems(stubRoot);
    if (planted.length < 7) {
      console.error(`${LABEL} SELFTEST FAIL: planted stub did not FAIL hard enough`, planted);
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
  console.log(`${LABEL} OK — trailer pickers use EntityPicker kind=trailer (§9.0 item 17 sweep)`);
}
