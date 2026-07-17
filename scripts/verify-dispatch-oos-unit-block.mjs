#!/usr/bin/env node
/**
 * 0441-mod2-is-oos-not-read-by-dispatch — guard that unit assignment paths
 * hard-block when mdata.units.is_oos is true (same severity class as WF-050 /
 * is_dispatch_blocked), and that a clear E_UNIT_OOS error is surfaced.
 *
 * Self-test: node scripts/verify-dispatch-oos-unit-block.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = process.env.VERIFY_DISPATCH_OOS_ROOT ?? process.cwd();
const failures = [];

function read(rel) {
  const p = path.resolve(ROOT, rel);
  if (!fs.existsSync(p)) {
    failures.push(`missing:${rel}`);
    return "";
  }
  return fs.readFileSync(p, "utf8");
}

function mustContain(rel, needle, label) {
  const src = read(rel);
  if (!src.includes(needle)) failures.push(`${rel}: missing ${label}`);
}

function mustMatch(rel, re, label) {
  const src = read(rel);
  if (!re.test(src)) failures.push(`${rel}: missing ${label}`);
}

const QUICK_ASSIGN = "apps/backend/src/dispatch/quick-assign.service.ts";
const QUICKSAVE_ROUTES = "apps/backend/src/dispatch/quicksave.routes.ts";
const ASSIGN_UNIT_SVC = "apps/backend/src/dispatch/assignments/quicksave.service.ts";
const ASSIGN_UNIT_ROUTES = "apps/backend/src/dispatch/assignments/quicksave.routes.ts";
const BOOK_LOAD = "apps/backend/src/dispatch/book-load.service.ts";
const PRE_DISPATCH = "apps/backend/src/dispatch/validation/pre-dispatch-validator.service.ts";
const BOOK_LOAD_UI = "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx";
const INLINE_PICKER = "apps/frontend/src/components/dispatch/InlineUnitPicker.tsx";

mustContain(QUICK_ASSIGN, "is_oos", "is_oos check on quick-assign");
mustContain(QUICK_ASSIGN, "UNIT_OOS", "UNIT_OOS hard_block code");
mustContain(QUICK_ASSIGN, "E_UNIT_OOS", "E_UNIT_OOS throw");
mustContain(QUICKSAVE_ROUTES, "E_UNIT_OOS", "E_UNIT_OOS route mapping");
mustContain(ASSIGN_UNIT_SVC, "is_oos", "is_oos check on assign-unit");
mustContain(ASSIGN_UNIT_SVC, "E_UNIT_OOS", "E_UNIT_OOS on assign-unit");
mustContain(ASSIGN_UNIT_ROUTES, "E_UNIT_OOS", "E_UNIT_OOS assign-unit route mapping");
mustContain(BOOK_LOAD, "E_UNIT_OOS", "E_UNIT_OOS on book-load");
mustContain(BOOK_LOAD, "is_oos", "is_oos check on book-load");
mustContain(PRE_DISPATCH, "is_oos", "is_oos in pre-dispatch validator");
mustContain(PRE_DISPATCH, "UNIT-OOS", "UNIT-OOS rule id");
mustContain(BOOK_LOAD_UI, "E_UNIT_OOS", "Book Load UI surfaces E_UNIT_OOS");
mustMatch(INLINE_PICKER, /is_oos/, "inline picker filters OOS units");

const qa = read(QUICK_ASSIGN);
if (qa.includes("is_dispatch_blocked") && !qa.includes("is_oos")) {
  failures.push(`${QUICK_ASSIGN}: is_dispatch_blocked without is_oos (regression)`);
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync(path.join(path.dirname(fileURLToPath(import.meta.url)), ".oos-selftest-"));
  try {
    const dirs = [
      "apps/backend/src/dispatch",
      "apps/backend/src/dispatch/assignments",
      "apps/backend/src/dispatch/validation",
      "apps/frontend/src/pages/dispatch/components",
      "apps/frontend/src/components/dispatch",
    ];
    for (const d of dirs) fs.mkdirSync(path.join(tmp, d), { recursive: true });
    // Plant incomplete quick-assign (missing is_oos) → must fail.
    fs.writeFileSync(path.join(tmp, QUICK_ASSIGN), "export async function quickAssignLoad() {}\n");
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      env: { ...process.env, VERIFY_DISPATCH_OOS_ROOT: tmp },
      encoding: "utf8",
    });
    if (r.status === 0) {
      console.error("selftest FAILED — planted missing is_oos should fail");
      process.exit(1);
    }
    console.log("verify-dispatch-oos-unit-block --selftest OK");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  process.exit(0);
}

if (failures.length > 0) {
  console.error("verify:dispatch-oos-unit-block FAILED");
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}

console.log("verify:dispatch-oos-unit-block OK");
