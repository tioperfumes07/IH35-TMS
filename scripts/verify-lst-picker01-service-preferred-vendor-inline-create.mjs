#!/usr/bin/env node
/**
 * LST-PICKER-01 slice — NewServiceDrawerForm preferred vendor was free-text and dropped at
 * create. ItemEditorModal persists preferred_vendor_id on catalogs.items via EntityPicker
 * kind=vendor allowCreate (canonical mdata.vendors + inline + Add new).
 *
 * Cursor even claim: 1874.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-picker01-service-preferred-vendor-inline-create";

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

function newServiceEmbedsItemEditor(drawerSrc) {
  return (
    /<ItemEditorModal[\s>]/.test(drawerSrc) &&
    (/from ["'].*ItemEditorModal["']|from ["'].*\/ItemEditorModal["']/.test(drawerSrc) ||
      /import\s*\{\s*ItemEditorModal\s*\}/.test(drawerSrc))
  );
}

function vendorPickerSource(root = ROOT, overrides = null) {
  const drawer = readRel(root, DRAWER, overrides);
  if (!drawer) return { rel: DRAWER, src: null };
  if (newServiceEmbedsItemEditor(drawer)) {
    return { rel: EDITOR, src: readRel(root, EDITOR, overrides) };
  }
  return { rel: DRAWER, src: drawer };
}

function block(src, testid) {
  const m = src.match(new RegExp(`data-testid=["']${testid}["'][\\s\\S]{0,1400}`));
  return m ? m[0] : "";
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function hasPreferredVendorEntityPicker(src) {
  const code = stripComments(src);
  const near =
    /Preferred vendor[\s\S]{0,900}kind=["']vendor["'][\s\S]{0,400}allowCreate/.test(code) ||
    /item-preferred-vendor-block[\s\S]{0,900}kind=["']vendor["'][\s\S]{0,400}allowCreate/.test(code) ||
    /service-preferred-vendor-select[\s\S]{0,900}kind=["']vendor["'][\s\S]{0,400}allowCreate/.test(code);
  return near && /EntityPicker/.test(code);
}

/** @returns {string[]} */
export function collectProblems(root = ROOT, overrides = null) {
  const problems = [];
  const drawer = readRel(root, DRAWER, overrides);
  const { rel: pickerRel, src: pickerSrc } = vendorPickerSource(root, overrides);
  const editor = readRel(root, EDITOR, overrides);
  const backend = readRel(root, BACKEND, overrides);

  if (!drawer) problems.push(`missing ${DRAWER}`);
  else if (newServiceEmbedsItemEditor(drawer)) {
    if (!/^\s*embedded\s*$/m.test(stripComments(drawer))) {
      problems.push(`${DRAWER}: must pass embedded (LST-F3360 single chrome)`);
    }
  }

  if (!pickerSrc) problems.push(`missing ${pickerRel}`);
  else if (pickerRel === DRAWER) {
    if (!/data-testid=["']service-preferred-vendor-select["']/.test(pickerSrc)) {
      problems.push(`${DRAWER}: must use data-testid=service-preferred-vendor-select`);
    }
    const b = block(pickerSrc, "service-preferred-vendor-select");
    if (!/kind=["']vendor["']/.test(b) || !/allowCreate/.test(b)) {
      problems.push(`${DRAWER}: preferred vendor must use EntityPicker kind=vendor allowCreate`);
    }
    if (/preferredVendor[^I]|value=\{form\.preferredVendor\}/.test(pickerSrc) && /<input[\s\S]{0,200}preferredVendor/.test(pickerSrc)) {
      problems.push(`${DRAWER}: must not keep free-text preferredVendor input`);
    }
    if (!/preferred_vendor_id/.test(pickerSrc)) {
      problems.push(`${DRAWER}: must persist preferred_vendor_id in create metadata`);
    }
    if (/createKind=["']vendor["']/.test(pickerSrc) && /listVendors/.test(pickerSrc)) {
      problems.push(`${DRAWER}: must not keep listVendors + ReferenceSelect createKind=vendor dual-path`);
    }
  } else {
    if (!hasPreferredVendorEntityPicker(pickerSrc)) {
      problems.push(`${EDITOR}: preferred vendor must use EntityPicker kind=vendor allowCreate`);
    }
    if (!/preferred_vendor_id/.test(pickerSrc)) {
      problems.push(`${EDITOR}: must persist preferred_vendor_id in create metadata`);
    }
    if (/createKind=["']vendor["']/.test(pickerSrc) && /listVendors/.test(pickerSrc)) {
      problems.push(`${EDITOR}: must not keep listVendors + ReferenceSelect createKind=vendor dual-path`);
    }
  }

  if (!editor) problems.push(`missing ${EDITOR}`);
  else {
    if (!hasPreferredVendorEntityPicker(editor)) {
      problems.push(`${EDITOR}: ItemEditorModal preferred vendor must use EntityPicker kind=vendor allowCreate`);
    }
    if (!/preferred_vendor_id/.test(editor)) {
      problems.push(`${EDITOR}: must keep preferred_vendor_id write`);
    }
  }

  if (!backend) problems.push(`missing ${BACKEND}`);
  else if (!/preferred_vendor_id/.test(backend)) {
    problems.push(`${BACKEND}: catalogs.items create/update must map preferred_vendor_id`);
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
    "testid-removed",
    DRAWER,
    (s) => s.replace(/^\s*embedded\s*$/m, ""),
    "embedded"
  );
  expectCaught(
    "entity-picker-removed",
    EDITOR,
    (s) =>
      s.replace(
        /item-preferred-vendor-block[\s\S]*?<\/div>/,
        `item-preferred-vendor-block">\n                  <ReferenceSelect createKind="vendor" options={vendorOptions} />\n                </div>`
      ),
    "EntityPicker kind=vendor allowCreate"
  );
  expectCaught(
    "persist-removed",
    EDITOR,
    (s) => s.replace(/preferred_vendor_id/g, "preferred_vendor_gone"),
    "preferred_vendor_id"
  );
  expectCaught(
    "backend-map-removed",
    BACKEND,
    (s) => s.replace(/preferred_vendor_id/g, "preferred_vendor_gone"),
    "preferred_vendor_id"
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
