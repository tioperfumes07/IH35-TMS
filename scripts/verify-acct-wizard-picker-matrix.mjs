#!/usr/bin/env node
/**
 * ACCT-F11 guard — wizard-depth (VERIFY-1) + universal-picker (VERIFY-2) matrix must exist
 * and cover Bill / Expense / Pay Bill / Journal Entry for TRANSP + USMCA.
 *
 * This guard ratchets the tracker doc shape + source wiring; it does NOT claim live
 * click-through PASS (no FAIL→PASS theater).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-wizard-picker-matrix";
const MATRIX = "docs/trackers/ACCT-F11-WIZARD-PICKER-VERIFY-MATRIX-2026-07-25.md";

const REQUIRED_WIZARDS = ["bill", "expense", "pay_bill", "journal_entry"];
const REQUIRED_ENTITIES = ["TRANSP", "USMCA"];
const REQUIRED_LAYERS = ["VERIFY-1", "VERIFY-2"];

const SURFACE_FILES = {
  bill: [
    "apps/frontend/src/components/accounting/VendorBillForm.tsx",
    "apps/frontend/src/pages/accounting/VendorBillCreatePage.tsx",
  ],
  expense: [
    "apps/frontend/src/components/expenses/RecordExpenseForm.tsx",
    "apps/frontend/src/pages/accounting/ExpenseCreatePage.tsx",
  ],
  pay_bill: [
    "apps/frontend/src/pages/accounting/PayBillModal.tsx",
    "apps/frontend/src/pages/accounting/BillsPage.tsx",
  ],
  journal_entry: [
    "apps/frontend/src/components/accounting/ManualJEModal.tsx",
    "apps/frontend/src/pages/accounting/ManualJEListPage.tsx",
  ],
};

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs, "utf8");
}

function extractManifest(md) {
  const match = md.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

export function assertWizardPickerMatrix({ matrixMd, root = ROOT } = {}) {
  const problems = [];
  if (!matrixMd || !matrixMd.trim()) {
    problems.push(`${MATRIX}: missing or empty`);
    return problems;
  }

  if (!/ACCT-F11/.test(matrixMd)) {
    problems.push(`${MATRIX}: must reference block ACCT-F11`);
  }
  for (const layer of REQUIRED_LAYERS) {
    if (!matrixMd.includes(layer)) {
      problems.push(`${MATRIX}: must document ${layer}`);
    }
  }
  for (const entity of REQUIRED_ENTITIES) {
    if (!matrixMd.includes(entity)) {
      problems.push(`${MATRIX}: must include entity ${entity}`);
    }
  }

  const manifest = extractManifest(matrixMd);
  if (!manifest) {
    problems.push(`${MATRIX}: machine manifest JSON block required`);
  } else {
    for (const key of ["wizards", "entities", "verify_layers", "surfaces"]) {
      if (!manifest[key]) problems.push(`${MATRIX}: manifest missing "${key}"`);
    }
    if (manifest.wizards) {
      for (const w of REQUIRED_WIZARDS) {
        if (!manifest.wizards.includes(w)) {
          problems.push(`${MATRIX}: manifest.wizards must include "${w}"`);
        }
      }
    }
    if (manifest.entities) {
      for (const e of REQUIRED_ENTITIES) {
        if (!manifest.entities.includes(e)) {
          problems.push(`${MATRIX}: manifest.entities must include "${e}"`);
        }
      }
    }
    if (manifest.verify_layers) {
      for (const l of REQUIRED_LAYERS) {
        if (!manifest.verify_layers.includes(l)) {
          problems.push(`${MATRIX}: manifest.verify_layers must include "${l}"`);
        }
      }
    }
  }

  // Human-readable section headers for each wizard surface.
  const headingChecks = [
    [/## Bill\s*\(`VendorBillForm`\)/, "Bill section"],
    [/## Expense\s*\(`RecordExpenseForm`\)/, "Expense section"],
    [/## Pay Bill\s*\(`PayBillModal`\)/, "Pay Bill section"],
    [/## Journal Entry\s*\(`ManualJEModal`\)/, "Journal Entry section"],
  ];
  for (const [re, name] of headingChecks) {
    if (!re.test(matrixMd)) problems.push(`${MATRIX}: missing ${name}`);
  }

  // Each wizard needs VERIFY-1 field table + VERIFY-2 picker table mentions.
  for (const wizard of REQUIRED_WIZARDS) {
    const slug =
      wizard === "pay_bill"
        ? "Pay Bill"
        : wizard === "journal_entry"
          ? "Journal Entry"
          : wizard.charAt(0).toUpperCase() + wizard.slice(1);
    const section = matrixMd.slice(matrixMd.indexOf(`## ${slug}`));
    if (!section.includes("VERIFY-1")) {
      problems.push(`${MATRIX}: ${slug} section must include VERIFY-1 rows`);
    }
    if (!section.includes("VERIFY-2")) {
      problems.push(`${MATRIX}: ${slug} section must include VERIFY-2 rows`);
    }
  }

  // Honesty: sweep summary must not claim live PASS without evidence marker.
  if (/Sweep summary[\s\S]*?\| Bill \| PASS/.test(matrixMd)) {
    problems.push(`${MATRIX}: summary must not mark Bill PASS without live evidence (no FAIL→PASS)`);
  }

  // Source files referenced in manifest must exist on disk.
  if (manifest?.surfaces) {
    for (const wizard of REQUIRED_WIZARDS) {
      const surf = manifest.surfaces[wizard];
      if (!surf?.source) {
        problems.push(`${MATRIX}: manifest.surfaces.${wizard}.source required`);
        continue;
      }
      if (!fs.existsSync(path.join(root, surf.source))) {
        problems.push(`${MATRIX}: missing source ${surf.source} for ${wizard}`);
      }
    }
  }

  for (const [wizard, files] of Object.entries(SURFACE_FILES)) {
    for (const rel of files) {
      if (!fs.existsSync(path.join(root, rel))) {
        problems.push(`${MATRIX}: expected ${wizard} surface file missing: ${rel}`);
      }
    }
  }

  return problems;
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN && process.argv.includes("--selftest")) {
  const real = read(MATRIX);
  if (!real) {
    console.error(`${LABEL} --selftest FAIL: ${MATRIX} not found`);
    process.exit(1);
  }
  const broken = real.replace('"pay_bill"', '"pay_bill_removed"');
  if (assertWizardPickerMatrix({ matrixMd: broken }).length === 0) {
    console.error(`${LABEL} --selftest FAIL: removed pay_bill not flagged`);
    process.exit(1);
  }
  const good = assertWizardPickerMatrix({ matrixMd: real });
  if (good.length) {
    console.error(`${LABEL} --selftest FAIL:\n${good.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

if (IS_MAIN) {
  const matrixMd = read(MATRIX);
  const problems = assertWizardPickerMatrix({ matrixMd });
  if (problems.length) {
    console.error(`${LABEL} FAIL:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — ACCT-F11 matrix covers Bill/Expense/Pay Bill/JE × VERIFY-1/2 × TRANSP/USMCA.`);
}
