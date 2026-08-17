#!/usr/bin/env node
/**
 * verify-inventory-part-create-save-readiness.mjs
 * LV-INVENTORY-PART-CREATE-SAVE-READINESS
 *
 * PartCreateDrawer Save must stay disabled until name + category are non-empty,
 * and submit must enforce the same canSubmit predicate (not category-only).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-inventory-part-create-save-readiness";
const TARGET = "apps/frontend/src/pages/inventory/PartCreateDrawer.tsx";

function analyze(src) {
  const failures = [];
  if (!/const canSubmit = Boolean\(formData\.name\.trim\(\) && formData\.category\.trim\(\)\)/.test(src)) {
    failures.push("must define canSubmit = name.trim() && category.trim()");
  }
  if (!/if \(!canSubmit \|\| createMutation\.isPending\) return/.test(src)) {
    failures.push("submit must gate on canSubmit (and pending)");
  }
  if (/if \(!formData\.category\.trim\(\)\) return/.test(src) && !/canSubmit/.test(src)) {
    failures.push("must not keep category-only submit gate");
  }
  const saveBtn = src.match(/<Button[\s\S]*?type="submit"[\s\S]*?>[\s\S]*?Save[\s\S]*?<\/Button>/);
  if (!saveBtn) {
    failures.push("missing Save submit Button");
  } else if (!/disabled=\{!canSubmit \|\| createMutation\.isPending\}/.test(saveBtn[0])) {
    failures.push("Save Button must disabled={!canSubmit || createMutation.isPending}");
  }
  return failures;
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function selftest() {
  const good = `
    const canSubmit = Boolean(formData.name.trim() && formData.category.trim());
    if (!canSubmit || createMutation.isPending) return;
    <Button type="submit" loading={createMutation.isPending} disabled={!canSubmit || createMutation.isPending}>Save</Button>
  `;
  const bad = `
    if (!formData.category.trim()) return;
    <Button type="submit" loading={createMutation.isPending}>Save</Button>
  `;
  if (analyze(good).length) fail(`selftest GOOD: ${analyze(good).join("; ")}`);
  if (!analyze(bad).length) fail("selftest expected BAD to fail");
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const src = fs.readFileSync(path.join(process.cwd(), TARGET), "utf8");
const failures = analyze(src);
if (failures.length) fail(failures.join("; "));
console.log(`${LABEL} PASS — part create Save readiness`);
