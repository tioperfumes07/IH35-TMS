#!/usr/bin/env node
/**
 * LST-PICKER-01 slice — NewServiceDrawerForm lacked Category + Class pickers that
 * ItemEditorModal already has (category via qbo_categories Combobox allowAddNew;
 * class via ReferenceSelect createKind=class). Nested create could not set
 * catalogs.items.category_id / default_class_id.
 *
 * Cursor even claim: 1876.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-picker01-service-class-category-inline-create";

const DRAWER = "apps/frontend/src/components/parity/drawers/NewServiceDrawerForm.tsx";
const EDITOR = "apps/frontend/src/pages/lists/accounting/ItemEditorModal.tsx";
const BACKEND = "apps/backend/src/catalogs/accounting/index.ts";

function readRel(root, rel, overrides) {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, rel)) {
    return overrides[rel];
  }
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

function block(src, testid) {
  const m = src.match(new RegExp(`data-testid=["']${testid}["'][\\s\\S]{0,1600}`));
  return m ? m[0] : "";
}

/** @returns {string[]} */
export function collectProblems(root = ROOT, overrides = null) {
  const problems = [];
  const drawer = readRel(root, DRAWER, overrides);
  const editor = readRel(root, EDITOR, overrides);
  const backend = readRel(root, BACKEND, overrides);

  if (!drawer) problems.push(`missing ${DRAWER}`);
  else {
    if (!/data-testid=["']service-class-select["']/.test(drawer)) {
      problems.push(`${DRAWER}: must use data-testid=service-class-select`);
    }
    if (!/createKind=["']class["']/.test(block(drawer, "service-class-select"))) {
      problems.push(`${DRAWER}: class picker must use createKind=class`);
    }
    if (!/data-testid=["']service-category-select["']/.test(drawer)) {
      problems.push(`${DRAWER}: must use data-testid=service-category-select`);
    }
    if (!/qboCategoriesCatalogClient\.create/.test(drawer)) {
      problems.push(`${DRAWER}: category inline create must use qboCategoriesCatalogClient.create`);
    }
    if (/createKind=["']category["']/.test(drawer)) {
      problems.push(`${DRAWER}: must NOT use createKind=category (writes CoA accounts, wrong catalog)`);
    }
    if (!/default_class_id/.test(drawer) || !/category_id/.test(drawer)) {
      problems.push(`${DRAWER}: must persist default_class_id + category_id in metadata`);
    }
  }

  if (!editor) problems.push(`missing ${EDITOR}`);
  else {
    if (!/createKind=["']class["']/.test(editor)) {
      problems.push(`${EDITOR}: must keep createKind=class (parity anchor)`);
    }
    if (!/qboCategoriesCatalogClient\.create/.test(editor)) {
      problems.push(`${EDITOR}: must keep qbo_categories category create`);
    }
  }

  if (!backend) problems.push(`missing ${BACKEND}`);
  else {
    if (!/default_class_id/.test(backend) || !/category_id/.test(backend)) {
      problems.push(`${BACKEND}: items metadata must map default_class_id + category_id`);
    }
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
    "class-testid-removed",
    DRAWER,
    (s) => s.replace(/data-testid=["']service-class-select["']/, 'data-testid="gone"'),
    "service-class-select"
  );
  expectCaught(
    "class-createKind-removed",
    DRAWER,
    (s) =>
      s.replace(
        /(data-testid=["']service-class-select["'][\s\S]{0,1600}?)createKind=["']class["']/,
        '$1createKind="vendor"'
      ),
    "createKind=class"
  );
  expectCaught(
    "category-client-removed",
    DRAWER,
    (s) => s.replace(/qboCategoriesCatalogClient\.create/g, "gone.create"),
    "qboCategoriesCatalogClient.create"
  );
  expectCaught(
    "wrong-category-kind",
    DRAWER,
    (s) => s.replace(/createKind=["']class["']/, 'createKind="category"'),
    "createKind=category"
  );
  expectCaught(
    "persist-removed",
    DRAWER,
    (s) => s.replace(/default_class_id/g, "default_class_gone").replace(/category_id/g, "category_gone"),
    "default_class_id"
  );

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAIL:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK — 5 planted defects caught, live sources clean`);
} else {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`${LABEL} OK`);
}
