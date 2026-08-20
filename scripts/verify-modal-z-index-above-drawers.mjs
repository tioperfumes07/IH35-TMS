#!/usr/bin/env node
/**
 * Modal.tsx's own z-index must sit above every full-record slide-over drawer's z-index (and below
 * Combobox's listbox z-index, so a picker opened inside a Modal still paints on top of it) — the
 * same class of bug already guarded for Combobox (verify-combobox-listbox-z-index-above-drawers.mjs).
 *
 * ROOT CAUSE (live-caught by CC-2 GUARD, 2026-08-20): CancelLoadModal.tsx (dispatch's "Cancel Load"
 * flow, which surfaces the catalog.dispatch.load_cancellation_reason picker) renders via the shared
 * Modal.tsx, which was hardcoded to z-[70]. LoadDetailDrawer.tsx — a full-record slide-over that
 * CancelLoadModal is opened FROM — is z-[210]. Both portal independently to document.body, so
 * LoadDetailDrawer's opaque panel painted over any Modal opened from inside it: confirmed live —
 * the modal's form controls (reason picker, notes textarea, Confirm Cancel button) existed in the
 * DOM, were focusable via ref, and had real event handlers, but were completely invisible to a real
 * user on a plain click, on a genuinely fresh drawer open, no scroll. This is the exact same failure
 * shape as the Combobox listbox bug this guard's sibling already locks — a different component, the
 * same missing-z-index-tier root cause — so Modal.tsx needs its own equivalent lock.
 *
 * FAIL: Modal.tsx's z-index < the highest z-[N] used by any OTHER file in the frontend (Combobox.tsx
 * excluded — its listbox is deliberately the highest tier so pickers opened inside a Modal still win).
 * PASS: Modal.tsx's z-index >= that max, so it can never be occluded by a known drawer, and Combobox's
 * listbox z-index remains >= Modal's, so a picker inside a Modal still paints on top of the Modal.
 *
 * Self-test: node scripts/verify-modal-z-index-above-drawers.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-modal-z-index-above-drawers";
const MODAL = path.join(ROOT, "apps/frontend/src/components/Modal.tsx");
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

function maxArbitraryZIndex(excludeFiles) {
  const files = walk(FRONTEND_SRC, []);
  const excluded = excludeFiles.map((f) => path.resolve(f));
  let max = 0;
  const re = /z-\[(\d+)\]/g;
  for (const file of files) {
    if (excluded.includes(path.resolve(file))) continue;
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

function modalZIndex() {
  const text = fs.readFileSync(MODAL, "utf8");
  // Only match the z-[N] literal inside the actual "fixed inset-0 z-[N] ..." className strings —
  // NOT prose mentions of z-[N] in surrounding comments (e.g. this file's own root-cause comment
  // references the old z-[70] and LoadDetailDrawer's z-[210] by name).
  const matches = [...text.matchAll(/"fixed inset-0 z-\[(\d+)\]/g)];
  assert(matches.length > 0, 'no `"fixed inset-0 z-[N]` class found in Modal.tsx');
  const values = matches.map((m) => Number(m[1]));
  // Modal has two branches (isDrawer ? ... : ...) that must both carry the SAME z tier.
  assert(new Set(values).size === 1, `Modal.tsx's isDrawer/centered branches disagree on z-index (${values.join(", ")})`);
  return values[0];
}

function comboboxListboxZIndex() {
  const text = fs.readFileSync(COMBOBOX, "utf8");
  const matches = [...text.matchAll(/zIndex:\s*(\d+|[A-Z_][A-Z0-9_]*)/g)];
  assert(matches.length > 0, "no zIndex assignment found in Combobox.tsx measureListboxStyle");
  const raw = matches[0][1];
  if (/^\d+$/.test(raw)) return Number(raw);
  const constRe = new RegExp(`const ${raw}\\s*=\\s*(\\d+)`);
  const constMatch = text.match(constRe);
  assert(constMatch, `zIndex references constant "${raw}" but no "const ${raw} = <number>" found`);
  return Number(constMatch[1]);
}

function check() {
  const modalZ = modalZIndex();
  const maxOther = maxArbitraryZIndex([MODAL, COMBOBOX]);
  assert(
    modalZ >= maxOther,
    `Modal.tsx z-index (${modalZ}) is below the highest z-[N] used elsewhere in the frontend (${maxOther}). ` +
      `A drawer at or above that value will paint over every Modal opened from inside it (e.g. CancelLoadModal ` +
      `opened from LoadDetailDrawer), making its form invisible even though it renders correctly in the DOM. ` +
      `Raise Modal.tsx's z-index above ${maxOther}.`,
  );
  const listboxZ = comboboxListboxZIndex();
  assert(
    listboxZ >= modalZ,
    `Combobox listbox zIndex (${listboxZ}) is below Modal.tsx's z-index (${modalZ}) — a picker opened ` +
      `inside a Modal (e.g. the cancellation-reason ReferenceSelect inside CancelLoadModal) would paint ` +
      `underneath the Modal itself. Raise Combobox's LISTBOX_Z_INDEX above ${modalZ}.`,
  );
}

function selftest() {
  const original = fs.readFileSync(MODAL, "utf8");
  const broken = original.replace(/z-\[215\]/g, "z-[1]");
  assert(broken !== original, "selftest mutation did not match — Modal.tsx's z-[215] literal changed");
  fs.writeFileSync(MODAL, broken);
  let failed = false;
  try {
    check();
  } catch {
    failed = true;
  } finally {
    fs.writeFileSync(MODAL, original);
  }
  assert(failed, "--selftest expected FAIL when Modal's z-index is dropped below every drawer's");
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
