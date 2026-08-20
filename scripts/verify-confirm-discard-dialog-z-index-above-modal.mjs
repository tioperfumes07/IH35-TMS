#!/usr/bin/env node
/**
 * ConfirmDiscardDialog.tsx (Modal's own unsaved-changes guard) must sit above the shared
 * Modal.tsx's z-index (and below Combobox's listbox z-index) — sibling lock to
 * verify-parity-drawer-z-index-above-modal.mjs, same class of bug, a different Modal child.
 *
 * ROOT CAUSE (live-caught by CC-3, 2026-08-21): CANCEL-LOAD-MODAL-INVISIBLE-BEHIND-DRAWER's fix
 * (2026-08-20) bumped the shared Modal.tsx from z-[70] to z-[215], but ConfirmDiscardDialog.tsx —
 * rendered BY Modal.tsx itself as its `attemptClose` unsaved-changes prompt — stayed hardcoded at
 * z-[80]. Both createPortal independently to document.body as stacking-context siblings, so
 * Modal's own backdrop painted OVER its own discard-confirmation dialog: closing any Modal with
 * unsaved changes (e.g. BookLoadModalV4) rendered "Discard unsaved changes?" in the DOM but
 * invisible behind Modal's backdrop, and clicks landed on Modal's onMouseDown={attemptClose}
 * instead of Cancel/Discard.
 *
 * FAIL: ConfirmDiscardDialog's z-index <= Modal.tsx's z-index, OR >= Combobox's listbox z-index.
 * PASS: Modal.tsx z-index < ConfirmDiscardDialog z-index < Combobox listbox z-index.
 *
 * Self-test: node scripts/verify-confirm-discard-dialog-z-index-above-modal.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-confirm-discard-dialog-z-index-above-modal";
const DIALOG_REL = "apps/frontend/src/components/dialogs/ConfirmDiscardDialog.tsx";
const MODAL_REL = "apps/frontend/src/components/Modal.tsx";
const COMBOBOX_REL = "apps/frontend/src/components/Combobox.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(`${LABEL}: ${msg}`);
}

function dialogZIndex(text) {
  const m = text.match(/"fixed inset-0 z-\[(\d+)\]/);
  assert(m, 'no `"fixed inset-0 z-[N]` class found in ConfirmDiscardDialog.tsx');
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
  const dialogZ = dialogZIndex(fs.readFileSync(path.join(root, DIALOG_REL), "utf8"));
  const modalZ = modalZIndex(fs.readFileSync(path.join(root, MODAL_REL), "utf8"));
  const listboxZ = comboboxListboxZIndex(fs.readFileSync(path.join(root, COMBOBOX_REL), "utf8"));
  assert(
    dialogZ > modalZ,
    `ConfirmDiscardDialog's z-index (${dialogZ}) is not above Modal.tsx's z-index (${modalZ}) — closing ` +
      `a Modal with unsaved changes would render "Discard unsaved changes?" BEHIND the Modal's own ` +
      `backdrop, so clicks hit the Modal's close handler instead of Cancel/Discard. Raise ` +
      `ConfirmDiscardDialog's z-index above ${modalZ}.`,
  );
  assert(
    listboxZ >= dialogZ,
    `Combobox listbox zIndex (${listboxZ}) is below ConfirmDiscardDialog's z-index (${dialogZ}) — a ` +
      `picker rendered near a discard confirmation would paint underneath it. Raise Combobox's ` +
      `LISTBOX_Z_INDEX above ${dialogZ}.`,
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

  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".confirm-discard-zindex-selftest-"));
  try {
    for (const rel of [MODAL_REL, COMBOBOX_REL]) {
      const dst = path.join(tmp, rel);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(path.join(ROOT, rel), dst);
    }
    // Poison: drop the dialog's z-index back below Modal's — must fail.
    const dialogSrc = fs.readFileSync(path.join(ROOT, DIALOG_REL), "utf8");
    const poisoned = dialogSrc.replace(/"fixed inset-0 z-\[\d+\]/, '"fixed inset-0 z-[80]');
    assert(poisoned !== dialogSrc, "selftest mutation did not match — ConfirmDiscardDialog.tsx's z-[N] literal changed");
    const dialogDst = path.join(tmp, DIALOG_REL);
    fs.mkdirSync(path.dirname(dialogDst), { recursive: true });
    fs.writeFileSync(dialogDst, poisoned);
    let failed = false;
    try {
      check(tmp);
    } catch {
      failed = true;
    }
    assert(failed, "--selftest expected FAIL when ConfirmDiscardDialog's z-index regresses below Modal's");
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
