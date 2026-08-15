#!/usr/bin/env node
/**
 * NewServiceDrawerForm + ItemEditorModal preferred-vendor ReferenceSelect server search.
 * Cursor even claim: 2110.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-service-item-preferred-vendor-search";
const SERVICE = "apps/frontend/src/components/parity/drawers/NewServiceDrawerForm.tsx";
const ITEM = "apps/frontend/src/pages/lists/accounting/ItemEditorModal.tsx";

function readRel(root, rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

function newServiceEmbedsItemEditor(serviceSrc) {
  return (
    /<ItemEditorModal[\s>]/.test(serviceSrc) &&
    (/from ["'].*ItemEditorModal["']|from ["'].*\/ItemEditorModal["']/.test(serviceSrc) ||
      /import\s*\{\s*ItemEditorModal\s*\}/.test(serviceSrc))
  );
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/** @returns {string[]} */
export function collectProblems(root = ROOT) {
  const problems = [];
  const serviceSrc = readRel(root, SERVICE);
  const itemSrc = readRel(root, ITEM);

  if (!serviceSrc) problems.push(`missing ${SERVICE}`);
  else if (newServiceEmbedsItemEditor(serviceSrc)) {
    if (!/^\s*embedded\s*$/m.test(stripComments(serviceSrc))) {
      problems.push(`${SERVICE}: must pass embedded so ParityDrawer is not double-shelled`);
    }
    if (/function NewServiceDrawerForm/.test(serviceSrc) && /useState/.test(serviceSrc)) {
      problems.push(`${SERVICE}: must not own a parallel item form (delegate to ItemEditorModal)`);
    }
  }

  const filesToCheck = [ITEM];
  if (serviceSrc && !newServiceEmbedsItemEditor(serviceSrc)) filesToCheck.push(SERVICE);

  for (const file of filesToCheck) {
    const src = readRel(root, file);
    if (!src) {
      problems.push(`missing ${file}`);
      continue;
    }
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    if (!/vendorSearch/.test(code) || !/onSearch=\{setVendorSearch\}/.test(code)) {
      problems.push(`${file}: preferred vendor must wire vendorSearch + onSearch`);
    }
    if (!/createKind=["']vendor["']/.test(code)) {
      problems.push(`${file}: preferred vendor must keep createKind=vendor`);
    }
    if (/listVendors\(\{[^}]*limit:\s*1000\s*\}\)/.test(code) && !/vendorSearch/.test(code)) {
      problems.push(`${file}: must not keep silent limit:1000 without search`);
    }
    // LST-F3356 — sell/buy sections must not nest a bordered card (box-in-box) inside the drawer.
    if (/rounded-sm border border-gray-200 p-3/.test(code)) {
      problems.push(`${file}: sell/buy sections must not use nested bordered cards (box-in-box)`);
    }
    if (!/data-testid=["']item-sell-buy-section["']/.test(code)) {
      problems.push(`${file}: sell/buy sections must keep data-testid=item-sell-buy-section (flat QBO chrome)`);
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
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-svc-item-vendor-"));
  try {
    for (const rel of [SERVICE, ITEM]) {
      const dir = path.join(stubRoot, path.dirname(rel));
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(stubRoot, rel),
        `listVendors({ operating_company_id: id, status: "active", limit: 1000 })
<ReferenceSelect createKind="vendor" options={vendorOptions} />
`
      );
    }
    const planted = collectProblems(stubRoot);
    if (planted.length < 2) {
      console.error(`${LABEL} SELFTEST FAIL: planted stub did not FAIL enough`);
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
  console.log(`${LABEL} OK — service/item preferred vendor search`);
}
