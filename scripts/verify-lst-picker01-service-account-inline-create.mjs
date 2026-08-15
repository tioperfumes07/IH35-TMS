#!/usr/bin/env node
/**
 * LST-PICKER-01 slice — NewServiceDrawerForm (nested product/service create) had bare
 * Combobox income/expense account pickers while ItemEditorModal already uses
 * ReferenceSelect createKind=account. Dual-path: nested create could not "+ Add new account".
 * Accounts still persist to catalogs.items.default_*_account_id (FIX-03).
 *
 * Cursor even claim: 1872.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-picker01-service-account-inline-create";

const DRAWER = "apps/frontend/src/components/parity/drawers/NewServiceDrawerForm.tsx";
const EDITOR = "apps/frontend/src/pages/lists/accounting/ItemEditorModal.tsx";
const ROUTES = "apps/backend/src/catalogs/items.routes.ts";

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

/** Account/income/expense picker assertions live in ItemEditorModal when drawer is a thin embed wrapper. */
function accountPickerSource(root = ROOT, overrides = null) {
  const drawer = readRel(root, DRAWER, overrides);
  if (!drawer) return { rel: DRAWER, src: null };
  if (newServiceEmbedsItemEditor(drawer)) {
    return { rel: EDITOR, src: readRel(root, EDITOR, overrides) };
  }
  return { rel: DRAWER, src: drawer };
}

function block(src, testid) {
  const m = src.match(new RegExp(`data-testid=["']${testid}["'][\\s\\S]{0,1200}`));
  return m ? m[0] : "";
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/** @returns {string[]} */
export function collectProblems(root = ROOT, overrides = null) {
  const problems = [];
  const drawer = readRel(root, DRAWER, overrides);
  const { rel: pickerRel, src: pickerSrc } = accountPickerSource(root, overrides);
  const editor = readRel(root, EDITOR, overrides);
  const routes = readRel(root, ROUTES, overrides);

  if (!drawer) problems.push(`missing ${DRAWER}`);
  else if (newServiceEmbedsItemEditor(drawer)) {
    if (!/^\s*embedded\s*$/m.test(stripComments(drawer))) {
      problems.push(`${DRAWER}: must pass embedded (LST-F3360 single chrome)`);
    }
    if (/function NewServiceDrawerForm/.test(drawer) && /useState/.test(drawer)) {
      problems.push(`${DRAWER}: must not own a parallel item form when embedding ItemEditorModal`);
    }
  }

  if (!pickerSrc) problems.push(`missing ${pickerRel}`);
  else if (pickerRel === DRAWER) {
    for (const id of ["service-income-account-select", "service-expense-account-select"]) {
      if (!new RegExp(`data-testid=["']${id}["']`).test(pickerSrc)) {
        problems.push(`${DRAWER}: must use data-testid=${id}`);
      } else if (!/createKind=["']account["']/.test(block(pickerSrc, id))) {
        problems.push(`${DRAWER}: ${id} must use createKind=account`);
      }
    }
    if (/Income account[\s\S]{0,400}<Combobox/.test(pickerSrc)) {
      problems.push(`${DRAWER}: must not keep bare Combobox for income account`);
    }
    if (/Expense account[\s\S]{0,400}<Combobox/.test(pickerSrc)) {
      problems.push(`${DRAWER}: must not keep bare Combobox for expense account`);
    }
    if (!/default_income_account_id/.test(pickerSrc) || !/default_expense_account_id/.test(pickerSrc)) {
      problems.push(`${DRAWER}: must keep FIX-03 persist of default_*_account_id`);
    }
  } else {
    if (!/createKind=["']account["']/.test(pickerSrc)) {
      problems.push(`${EDITOR}: ItemEditorModal must keep createKind=account (parity anchor)`);
    }
    if (/Income account[\s\S]{0,500}<Combobox/.test(pickerSrc)) {
      problems.push(`${EDITOR}: must not keep bare Combobox for income account`);
    }
    if (/Expense account[\s\S]{0,500}<Combobox/.test(pickerSrc)) {
      problems.push(`${EDITOR}: must not keep bare Combobox for expense account`);
    }
    if (!/default_income_account_id/.test(pickerSrc) || !/default_expense_account_id/.test(pickerSrc)) {
      problems.push(`${EDITOR}: must persist default_*_account_id in create metadata`);
    }
  }

  if (!editor) problems.push(`missing ${EDITOR}`);
  else if (!/createKind=["']account["']/.test(editor)) {
    problems.push(`${EDITOR}: ItemEditorModal must keep createKind=account (parity anchor)`);
  }

  if (!routes) problems.push(`missing ${ROUTES}`);
  else {
    if (!/default_income_account_id/.test(routes) || !/default_expense_account_id/.test(routes)) {
      problems.push(`${ROUTES}: items create must accept default_*_account_id`);
    }
    if (!/catalogs\.items/.test(routes)) {
      problems.push(`${ROUTES}: writes must target catalogs.items`);
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
    "income-testid-removed",
    DRAWER,
    (s) => s.replace(/^\s*embedded\s*$/m, ""),
    "embedded"
  );
  expectCaught(
    "expense-createKind-removed",
    EDITOR,
    (s) => s.replace(/createKind=["']account["']/g, 'createKind="vendor"'),
    "createKind=account"
  );
  expectCaught(
    "income-combobox-reintroduced",
    EDITOR,
    (s) =>
      s.replace(
        /Income account \*[\s\S]{0,500}?<ReferenceSelect/,
        `Income account *
                <Combobox options={incomeOptions} value={form.incomeAccountId} onChange={() => {}} />`
      ),
    "Combobox"
  );
  expectCaught(
    "persist-removed",
    EDITOR,
    (s) => s.replace(/default_income_account_id/g, "default_income_gone"),
    "default_*_account_id"
  );
  expectCaught(
    "editor-parity-lost",
    EDITOR,
    (s) => s.replace(/createKind=["']account["']/g, 'createKind="vendor"'),
    "createKind=account"
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
