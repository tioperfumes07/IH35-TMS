#!/usr/bin/env node
/**
 * Combobox listbox z-index must sit above every other explicit z-index used in the frontend
 * (drawers, modals, slide-overs) — not just the current max, so the very next drawer that
 * raises the bar cannot silently re-introduce this bug.
 *
 * ROOT CAUSE (live-caught by CC-2 GUARD, 2026-08-18): the codebase has (at least) two z-index
 * tiers — ParityDrawer/Modal top out at z-[70], while full-record slide-over detail drawers
 * (e.g. LoadDetailDrawer) use z-[200]/z-[210]. Combobox's portaled listbox was hardcoded to
 * zIndex: 80 — correctly above the first tier, a full tier below the second. Any
 * Combobox/ReferenceSelect opened inside a z-[200]+ drawer (first caught: MultiStopEditor's
 * "Pickup / appointment type" picker, AUDIT rows 3010/10560/10640, PR #9052) rendered a real,
 * data-backed, clickable listbox — confirmed present and open in the DOM/accessibility tree,
 * with its catalog fetch returning 200 — but the drawer's own opaque panel painted over it, so
 * the dropdown was completely invisible and unusable to a real user. picker_law's own guard
 * (verify-load-drawer-stops-picker-law.mjs) only checks source-level wiring, so it PASSED while
 * the feature was broken live — this guard checks the one thing that guard structurally cannot:
 * actual stacking order.
 *
 * FAIL: Combobox's listbox zIndex < the highest `z-[NNN]` used anywhere else in the frontend.
 * PASS: Combobox's listbox zIndex >= that max, so it can never be occluded by a known drawer.
 *
 * Self-test: node scripts/verify-combobox-listbox-z-index-above-drawers.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-combobox-listbox-z-index-above-drawers";
const COMBOBOX = path.join(ROOT, "apps/frontend/src/components/Combobox.tsx");
const FRONTEND_SRC = path.join(ROOT, "apps/frontend/src");

function assert(cond, msg) {
  if (!cond) throw new Error(`${LABEL}: ${msg}`);
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts"))) out.push(full);
  }
  return out;
}

function maxArbitraryZIndex(excludeFile) {
  const files = walk(FRONTEND_SRC, []);
  let max = 0;
  const re = /z-\[(\d+)\]/g;
  for (const file of files) {
    if (path.resolve(file) === path.resolve(excludeFile)) continue;
    if (file.endsWith(".test.tsx") || file.endsWith(".test.ts")) continue;
    const text = fs.readFileSync(file, "utf8");
    let m;
    while ((m = re.exec(text))) {
      const n = Number(m[1]);
      if (n > max) max = n;
    }
  }
  return max;
}

function comboboxListboxZIndex() {
  const text = fs.readFileSync(COMBOBOX, "utf8");
  const matches = [...text.matchAll(/zIndex:\s*(\d+|[A-Z_][A-Z0-9_]*)/g)];
  assert(matches.length > 0, "no zIndex assignment found in Combobox.tsx measureListboxStyle");
  // Resolve a named constant (e.g. LISTBOX_Z_INDEX) if that's what's assigned, else take the numeric literal.
  const raw = matches[0][1];
  if (/^\d+$/.test(raw)) return Number(raw);
  const constRe = new RegExp(`const ${raw}\\s*=\\s*(\\d+)`);
  const constMatch = text.match(constRe);
  assert(constMatch, `zIndex references constant "${raw}" but no "const ${raw} = <number>" found`);
  return Number(constMatch[1]);
}

function check() {
  const listboxZ = comboboxListboxZIndex();
  const maxOther = maxArbitraryZIndex(COMBOBOX);
  assert(
    listboxZ >= maxOther,
    `Combobox listbox zIndex (${listboxZ}) is below the highest z-[N] used elsewhere in the frontend (${maxOther}). ` +
      `A drawer/modal at or above that value will paint over every open Combobox/ReferenceSelect dropdown, making ` +
      `it invisible and unusable even though it renders correctly in the DOM. Raise the Combobox listbox zIndex above ${maxOther}.`,
  );
}

function selftest() {
  const original = fs.readFileSync(COMBOBOX, "utf8");
  // Force the listbox z-index absurdly low so it must be below whatever the real codebase max is.
  const broken = original.replace(/const LISTBOX_Z_INDEX = \d+;/, "const LISTBOX_Z_INDEX = 1;");
  assert(broken !== original, "selftest mutation did not match — LISTBOX_Z_INDEX constant shape changed");
  fs.writeFileSync(COMBOBOX, broken);
  let failed = false;
  try {
    check();
  } catch {
    failed = true;
  } finally {
    fs.writeFileSync(COMBOBOX, original);
  }
  assert(failed, "--selftest expected FAIL when the listbox z-index is dropped below every drawer's");
  check();
  console.log(`${LABEL}: OK — selftest PASS`);
}

const mode = process.argv.includes("--selftest") ? "selftest" : "check";
try {
  if (mode === "selftest") selftest();
  else {
    check();
    console.log(`${LABEL}: OK`);
  }
} catch (e) {
  console.error(String(e?.message || e));
  process.exit(1);
}
