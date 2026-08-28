#!/usr/bin/env node
/**
 * verify-book-load-modal-z-index-above-drawer.mjs
 *
 * BOOK-LOAD-MODAL-INVISIBLE-BEHIND-DRAWER — BookLoadModalV4 is opened two ways: standalone
 * ("+ Book Load") and from inside LoadDetailDrawer's per-section "Edit ▸" (LoadDetailDrawer sets
 * editLoadId and leaves the drawer mounted underneath, matching its own doc comment: "a per-section
 * 'Edit ▸' into the prefilled wizard"). LoadDetailDrawer's own panel renders at z-[210]. The modal's
 * old backdrop was a plain Tailwind `z-50` — four tiers below the drawer — so opening Edit from inside
 * the drawer produced a fully-rendered, fully-interactive, but completely INVISIBLE and UNCLICKABLE
 * form: confirmed live (2026-08-27) via `document.elementFromPoint()` at the modal input's own
 * on-screen coordinates, which returned the drawer's read-only text node, not the modal.
 *
 * This is the SAME bug class already fixed once for CancelLoadModal
 * (CANCEL-LOAD-MODAL-INVISIBLE-BEHIND-DRAWER, Modal.tsx bumped to z-[215]) — that fix never
 * propagated to BookLoadModalV4's own hand-rolled `createPortal` overlay, which doesn't use the
 * shared Modal.tsx shell.
 *
 * FAILS IF ANY OF:
 *   1. BookLoadModalV4.tsx's outer backdrop div does not carry a z-index >= 211 (strictly above
 *      LoadDetailDrawer's z-[210]).
 *   2. LoadDetailDrawer.tsx's aside panel z-index has changed from z-[210] without this guard's own
 *      threshold being revisited (documents the dependency so a future drawer z-bump doesn't silently
 *      re-open the gap).
 *
 * Self-test (pure logic, no filesystem): node scripts/verify-book-load-modal-z-index-above-drawer.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-book-load-modal-z-index-above-drawer";

const DRAWER_Z = 210;
const MODAL_MIN_Z = DRAWER_Z + 1;

/** Extracts the z-[N] value from the first `fixed inset-0 z-[N]` match, or null. */
function extractOverlayZ(src) {
  const m = src.match(/fixed inset-0 z-\[(\d+)\]/);
  if (m) return Number(m[1]);
  // A bare Tailwind z-50 (no bracket) is the historical bug shape — treat as z=50.
  if (/fixed inset-0 z-50\b/.test(src)) return 50;
  return null;
}

export function computeFailures({ bookLoadModal, loadDetailDrawer }) {
  const errors = [];

  const modalZ = extractOverlayZ(bookLoadModal ?? "");
  if (modalZ === null) {
    errors.push("BookLoadModalV4.tsx: could not find its outer `fixed inset-0 z-[N]` backdrop — did the overlay markup change shape?");
  } else if (modalZ < MODAL_MIN_Z) {
    errors.push(
      `BookLoadModalV4.tsx: backdrop z-index is ${modalZ}, must be >= ${MODAL_MIN_Z} so it renders above LoadDetailDrawer's z-[${DRAWER_Z}] panel when Edit is opened from inside the drawer (BOOK-LOAD-MODAL-INVISIBLE-BEHIND-DRAWER)`
    );
  }

  const drawerHasExpectedZ = (loadDetailDrawer ?? "").includes(`z-[${DRAWER_Z}]`);
  if (!drawerHasExpectedZ) {
    errors.push(
      `LoadDetailDrawer.tsx: expected its panel to still carry z-[${DRAWER_Z}] — if this changed intentionally, update DRAWER_Z in this guard and re-verify BookLoadModalV4's z-index is still above it`
    );
  }

  return errors;
}

function readIf(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return "";
  return fs.readFileSync(p, "utf8");
}

if (process.argv.includes("--selftest")) {
  const goodModal = 'className="fixed inset-0 z-[216] flex items-start justify-center overflow-y-auto px-4 py-6"';
  const goodDrawer = 'className="fixed right-0 top-0 z-[210] flex h-full w-full flex-col overflow-hidden bg-white shadow-xl md:w-[600px]"';

  const pass = computeFailures({ bookLoadModal: goodModal, loadDetailDrawer: goodDrawer });

  const failOldBug = computeFailures({
    bookLoadModal: 'className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-6"',
    loadDetailDrawer: goodDrawer,
  });

  const failTooLow = computeFailures({
    bookLoadModal: 'className="fixed inset-0 z-[205] flex items-start justify-center overflow-y-auto px-4 py-6"',
    loadDetailDrawer: goodDrawer,
  });

  const failDrawerZChanged = computeFailures({
    bookLoadModal: goodModal,
    loadDetailDrawer: 'className="fixed right-0 top-0 z-[230] flex h-full w-full flex-col overflow-hidden bg-white shadow-xl md:w-[600px]"',
  });

  const checks = [
    ["clean inputs produce zero failures", pass.length === 0],
    ["the original bare z-50 regression is flagged", failOldBug.some((e) => e.includes("must be >="))],
    ["a z-index above 50 but still below the drawer is flagged", failTooLow.some((e) => e.includes("must be >="))],
    ["an unnoticed LoadDetailDrawer z-index change is flagged", failDrawerZChanged.some((e) => e.includes("expected its panel to still carry"))],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const [n] of failed) console.error("  x " + n);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const failures = computeFailures({
  bookLoadModal: readIf("apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx"),
  loadDetailDrawer: readIf("apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx"),
});

if (failures.length) {
  console.error(`${LABEL} FAIL:`);
  for (const f of failures) console.error("  x " + f);
  process.exit(1);
}
console.log(`${LABEL} PASS — BookLoadModalV4 backdrop z-index sits above LoadDetailDrawer's z-[${DRAWER_Z}] panel`);
