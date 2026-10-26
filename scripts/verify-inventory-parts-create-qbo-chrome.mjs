#!/usr/bin/env node
/**
 * Inventory qbo_chrome — leaf-specific Built for the 3 leaves only "claimed" by the broad
 * verify-cursor-vertical-qbo-picker-modules.mjs sweep (leafRe: ^(parts)(\.|$)) — same
 * theater-coverage class already found+fixed across every other module this session.
 *
 * All 3 leaves are genuinely built in PartCreateDrawer.tsx: a real fixed-overlay drawer
 * (parts.create) with a real EntityPicker vendor field (parts.create.vendor_picker — server-search,
 * CLS-SILENT-CAP, not a capped 200-row dropdown) and a real MoneyInput unit-cost field
 * (parts.create.money).
 *
 * @matrix-built {"modules":["inventory"],"cols":["qbo_chrome"],"leafRe":"^parts\\.create$","task":"VERTICAL-QBO-CHROME-inventory-parts-create","vertical":"column-wave"}
 * @matrix-built {"modules":["inventory"],"cols":["qbo_chrome"],"leafRe":"^parts\\.create\\.vendor_picker$","task":"VERTICAL-QBO-CHROME-inventory-vendor-picker","vertical":"column-wave"}
 * @matrix-built {"modules":["inventory"],"cols":["qbo_chrome"],"leafRe":"^parts\\.create\\.money$","task":"VERTICAL-QBO-CHROME-inventory-money","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-inventory-parts-create-qbo-chrome.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-inventory-parts-create-qbo-chrome";

const CHECKS = [
  {
    // 443365-A (#27709, owner one-popup-format law): the hand-built fixed-overlay drawer became the shared <ParityDrawer>.
    name: "parts.create / parts.create.vendor_picker / parts.create.money: PartCreateDrawer shared ParityDrawer + real EntityPicker vendor field + real MoneyInput",
    file: "apps/frontend/src/pages/inventory/PartCreateDrawer.tsx",
    pattern: /<ParityDrawer\b[\s\S]{0,3200}inv-part-create-vendor-picker[\s\S]{0,300}<EntityPicker\b[\s\S]{0,120}kind="vendor"[\s\S]{0,2000}<MoneyInput\b/,
  },
];

function runChecks(root = ROOT) {
  const fails = [];
  for (const c of CHECKS) {
    const abs = path.join(root, c.file);
    if (!fs.existsSync(abs)) {
      fails.push(`${c.name}: missing ${c.file}`);
      continue;
    }
    const src = fs.readFileSync(abs, "utf8");
    if (!c.pattern.test(src)) fails.push(`${c.name}: pattern miss in ${c.file}`);
  }
  return fails;
}

function selftest() {
  const live = runChecks();
  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".inventory-parts-create-qbo-chrome-selftest-"));
  try {
    for (const c of CHECKS) {
      const abs = path.join(tmp, c.file);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, "// poison — no chrome\n");
    }
    const planted = runChecks(tmp);
    if (planted.length < CHECKS.length) {
      console.error(`${LABEL} SELFTEST FAIL — planted chrome misses not caught (${planted.length})`);
      process.exit(1);
    }
    // Real-source plants: each one removes a single leaf from the live file.
    const realSrc = fs.readFileSync(path.join(ROOT, CHECKS[0].file), "utf8");
    for (const [name, mutated] of [
      ["hand-built overlay instead of the shared drawer", realSrc.split("<ParityDrawer").join("<div")],
      ["vendor picker swapped for a capped select", realSrc.split("<EntityPicker").join("<SelectCombobox")],
      ["money field as a plain input", realSrc.split("<MoneyInput").join("<input")],
    ]) {
      if (mutated === realSrc || CHECKS[0].pattern.test(mutated)) {
        console.error(`${LABEL} SELFTEST FAIL — planted "${name}" not caught`);
        process.exit(1);
      }
    }
    console.log(`${LABEL} SELFTEST PASS (poison trips ${planted.length})`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (live.length) {
    console.error(`${LABEL} FAIL live:\n- ${live.join("\n- ")}`);
    process.exit(1);
  }
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const fails = runChecks();
if (fails.length) {
  console.error(`${LABEL} FAIL (${fails.length}):\n- ${fails.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — ${CHECKS.length} check / 3 inventory qbo_chrome leaf asserts`);
