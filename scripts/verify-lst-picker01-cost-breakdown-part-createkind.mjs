#!/usr/bin/env node
/**
 * LST-PICKER-01 slice — CostBreakdownBox Section B parts row used ReferenceSelect
 * createKind="item" while labeling "+ Add new part". Inline create wrote catalogs.items
 * instead of maintenance.parts_inventory (registry key "part" / QuickCreateEntityModal part form).
 *
 * Cursor even claim: 1878.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-picker01-cost-breakdown-part-createkind";

const BOX = "apps/frontend/src/components/forms/shared/CostBreakdownBox.tsx";
const REGISTRY = "apps/frontend/src/components/parity/catalogPickerRegistry.ts";
const QUICK = "apps/frontend/src/components/forms/shared/QuickCreateEntityModal.tsx";

function readRel(root, rel, overrides) {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, rel)) {
    return overrides[rel];
  }
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

/** @returns {string[]} */
export function collectProblems(root = ROOT, overrides = null) {
  const problems = [];
  const box = readRel(root, BOX, overrides);
  const registry = readRel(root, REGISTRY, overrides);
  const quick = readRel(root, QUICK, overrides);

  if (!box) problems.push(`missing ${BOX}`);
  else {
    // Part picker block: addNewLabel="+ Add new part" must pair with createKind=part
    const partLabelIdx = box.indexOf('addNewLabel="+ Add new part"');
    if (partLabelIdx < 0) {
      problems.push(`${BOX}: must keep addNewLabel="+ Add new part" on the parts row picker`);
    } else {
      const window = box.slice(Math.max(0, partLabelIdx - 400), partLabelIdx + 80);
      if (!/createKind=["']part["']/.test(window)) {
        problems.push(`${BOX}: parts row "+ Add new part" must use createKind=part (not item)`);
      }
      if (/createKind=["']item["']/.test(window)) {
        problems.push(`${BOX}: parts row must not use createKind=item beside "+ Add new part"`);
      }
    }
    // Service/item picker in Section B should still use createKind=item
    if (!/createKind=["']item["']/.test(box)) {
      problems.push(`${BOX}: Section B product/service picker must keep createKind=item`);
    }
  }

  if (!registry) problems.push(`missing ${REGISTRY}`);
  else if (!/key:\s*["']part["']/.test(registry) || !/maintenance\.parts_inventory/.test(registry)) {
    problems.push(`${REGISTRY}: part createKind must map to maintenance.parts_inventory`);
  }

  if (!quick) problems.push(`missing ${QUICK}`);
  else if (!/kind === ["']part["']/.test(quick)) {
    problems.push(`${QUICK}: must keep part quick-create form`);
  }

  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL (baseline must be clean):`);
    for (const p of baseline) console.error("  - " + p);
    process.exit(1);
  }

  const expectCaught = (name, rel, mutator, needle) => {
    const live = readRel(ROOT, rel);
    if (!live) {
      failures.push(`${name}: missing ${rel}`);
      return;
    }
    const mutated = mutator(live);
    if (mutated === live) {
      failures.push(`${name}: inert mutation`);
      return;
    }
    const problems = collectProblems(ROOT, { [rel]: mutated });
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(`${name}: NOT caught (got: ${problems.join(" | ") || "none"})`);
    }
  };

  expectCaught(
    "part-kind-regressed-to-item",
    BOX,
    (s) =>
      s.replace(
        /(addNewLabel=["']\+ Add new part["'][\s\S]{0,0}|createKind=["']part["'][\s\S]{0,200}addNewLabel=["']\+ Add new part["'])/,
        (m) => m.replace(/createKind=["']part["']/, 'createKind="item"')
      ).replace(
        /createKind=["']part["'](\s*operatingCompanyId=\{operatingCompanyId\}\s*placeholder=["']Select part)/,
        'createKind="item"$1'
      ),
    "createKind=part"
  );
  // Simpler direct mutation
  expectCaught(
    "part-to-item-direct",
    BOX,
    (s) => {
      const i = s.indexOf('addNewLabel="+ Add new part"');
      if (i < 0) return s;
      const start = Math.max(0, i - 350);
      const chunk = s.slice(start, i);
      const fixed = chunk.replace(/createKind=["']part["']/, 'createKind="item"');
      return s.slice(0, start) + fixed + s.slice(i);
    },
    "createKind=part"
  );
  expectCaught(
    "label-removed",
    BOX,
    (s) => s.replace(/addNewLabel=["']\+ Add new part["']/, 'addNewLabel="+ Add new widget"'),
    "Add new part"
  );
  expectCaught(
    "registry-part-removed",
    REGISTRY,
    (s) => s.replace(/key:\s*["']part["']/, 'key: "part_gone"'),
    "part"
  );
  expectCaught(
    "quick-part-removed",
    QUICK,
    (s) => s.replace(/kind === ["']part["']/g, 'kind === "part_gone"'),
    "part"
  );

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAIL:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK — planted defects caught, live sources clean`);
} else {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`${LABEL} OK`);
}
