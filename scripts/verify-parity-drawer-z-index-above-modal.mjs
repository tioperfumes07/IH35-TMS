#!/usr/bin/env node
/**
 * ParityDrawer's `stackAboveModal` tier must sit above the shared Modal.tsx's z-index (and below
 * Combobox's listbox z-index) — sibling lock to verify-modal-z-index-above-drawers.mjs, for the
 * OTHER direction of the same z-index-tier class of bug.
 *
 * ROOT CAUSE (live-caught by CC-3, 2026-08-21): CANCEL-LOAD-MODAL-INVISIBLE-BEHIND-DRAWER's fix
 * (2026-08-20) bumped the shared Modal.tsx from z-[70] to z-[215] to clear LoadDetailDrawer's
 * z-[210], but never touched ParityDrawer.tsx's `stackAboveModal` tier, which stayed hardcoded at
 * z-[80] — silently reopening LV-WO-PARTPANEL-BEHIND-MODAL-DESTROYS-FORM: any nested "+ Create"
 * drawer (QuickCreateEntityModal, CatalogQuickCreateDrawer, InlineCreateDrawer, CreateTrailerModal,
 * CreateUnitModal — all opened from inside a Modal such as Create Work Order or Book Load) painted
 * BEHIND that Modal's backdrop again, so Save clicks hit the Modal's onMouseDown-close handler
 * instead of the drawer, and the create never POSTs.
 *
 * FAIL: ParityDrawer's stackAboveModal z-index <= Modal.tsx's z-index, OR >= Combobox's listbox
 * z-index (a picker opened inside the drawer must still paint above the drawer itself).
 * PASS: Modal.tsx z-index < ParityDrawer stackAboveModal z-index < Combobox listbox z-index.
 *
 * Self-test: node scripts/verify-parity-drawer-z-index-above-modal.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-parity-drawer-z-index-above-modal";
const DRAWER = path.join(ROOT, "apps/frontend/src/components/parity/ParityDrawer.tsx");
const MODAL = path.join(ROOT, "apps/frontend/src/components/Modal.tsx");
const COMBOBOX = path.join(ROOT, "apps/frontend/src/components/Combobox.tsx");

function assert(cond, msg) {
  if (!cond) throw new Error(`${LABEL}: ${msg}`);
}

function drawerStackAboveModalZIndex(text) {
  // Only match the literal inside `stackAboveModal ? "z-[N]" : "z-[60]"` — not prose comments.
  const m = text.match(/stackAboveModal\s*\?\s*"z-\[(\d+)\]"\s*:\s*"z-\[\d+\]"/);
  assert(m, 'no `stackAboveModal ? "z-[N]" : "z-[...]"` ternary found in ParityDrawer.tsx');
  return Number(m[1]);
}

function modalZIndex(text) {
  const matches = [...text.matchAll(/"fixed inset-0 z-\[(\d+)\]/g)];
  assert(matches.length > 0, 'no `"fixed inset-0 z-[N]` class found in Modal.tsx');
  const values = matches.map((m) => Number(m[1]));
  assert(new Set(values).size === 1, `Modal.tsx's isDrawer/centered branches disagree on z-index (${values.join(", ")})`);
  return values[0];
}

function comboboxListboxZIndex(text) {
  const matches = [...text.matchAll(/zIndex:\s*(\d+|[A-Z_][A-Z0-9_]*)/g)];
  assert(matches.length > 0, "no zIndex assignment found in Combobox.tsx measureListboxStyle");
  const raw = matches[0][1];
  if (/^\d+$/.test(raw)) return Number(raw);
  const constRe = new RegExp(`const ${raw}\\s*=\\s*(\\d+)`);
  const constMatch = text.match(constRe);
  assert(constMatch, `zIndex references constant "${raw}" but no "const ${raw} = <number>" found`);
  return Number(constMatch[1]);
}

function check(root = ROOT) {
  const drawerZ = drawerStackAboveModalZIndex(fs.readFileSync(path.join(root, "apps/frontend/src/components/parity/ParityDrawer.tsx"), "utf8"));
  const modalZ = modalZIndex(fs.readFileSync(path.join(root, "apps/frontend/src/components/Modal.tsx"), "utf8"));
  const listboxZ = comboboxListboxZIndex(fs.readFileSync(path.join(root, "apps/frontend/src/components/Combobox.tsx"), "utf8"));
  assert(
    drawerZ > modalZ,
    `ParityDrawer's stackAboveModal z-index (${drawerZ}) is not above Modal.tsx's z-index (${modalZ}) — a ` +
      `nested "+ Create" drawer opened from inside a Modal (e.g. Create Work Order, Book Load) would paint ` +
      `BEHIND that Modal's backdrop, so Save clicks hit the Modal's close handler instead of the drawer and ` +
      `the create never POSTs. Raise ParityDrawer's stackAboveModal tier above ${modalZ}.`,
  );
  assert(
    listboxZ >= drawerZ,
    `Combobox listbox zIndex (${listboxZ}) is below ParityDrawer's stackAboveModal z-index (${drawerZ}) — a ` +
      `picker opened inside a nested "+ Create" drawer would paint underneath the drawer itself. Raise ` +
      `Combobox's LISTBOX_Z_INDEX above ${drawerZ}.`,
  );
}

function selftest() {
  const live = () => {
    try {
      check();
      return null;
    } catch (e) {
      return e;
    }
  };
  assert(!live(), `SELFTEST FAIL — clean tree already red: ${live()?.message}`);

  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".parity-drawer-zindex-selftest-"));
  try {
    const drawerRel = "apps/frontend/src/components/parity/ParityDrawer.tsx";
    const modalRel = "apps/frontend/src/components/Modal.tsx";
    const comboboxRel = "apps/frontend/src/components/Combobox.tsx";
    for (const rel of [modalRel, comboboxRel]) {
      const dst = path.join(tmp, rel);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(path.join(ROOT, rel), dst);
    }
    // Poison 1: drop the drawer's stackAboveModal tier back below Modal's z-index — must fail.
    const drawerSrc = fs.readFileSync(path.join(ROOT, drawerRel), "utf8");
    const poisoned = drawerSrc.replace(/stackAboveModal \? "z-\[\d+\]" : "z-\[60\]"/, 'stackAboveModal ? "z-[80]" : "z-[60]"');
    assert(poisoned !== drawerSrc, "selftest mutation did not match — ParityDrawer.tsx's stackAboveModal ternary literal changed");
    const drawerDst = path.join(tmp, drawerRel);
    fs.mkdirSync(path.dirname(drawerDst), { recursive: true });
    fs.writeFileSync(drawerDst, poisoned);
    let failed = false;
    try {
      check(tmp);
    } catch {
      failed = true;
    }
    assert(failed, "--selftest expected FAIL when ParityDrawer's stackAboveModal z-index regresses below Modal's");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
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
