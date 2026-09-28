#!/usr/bin/env node
/**
 * ROUND 203 — Dispatch query-key + window.open + SectionErrorBoundary guard.
 *
 * Asserts Devin-sweep F1/F2/F20 stay fixed:
 *  1. LoadDetailDrawer never uses window.open(..., "noopener") when the return handle is used
 *     (noopener makes open() return null per HTML spec — false "popup blocked").
 *  2. DispatchBoard quick-assign / inline confirm invalidates real keys:
 *     ["loads"], ["dispatch","units-without-load"], ["dispatch-board"] — never ["dispatch","loads"].
 *  3. Dispatch.tsx wraps DispatchBoard, DispatchKanban, and LoadDetailDrawer in SectionErrorBoundary;
 *     CmdKQuickSwitcher wraps results in SectionErrorBoundary.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-dispatch-query-keys-and-boundaries";

const DRAWER = path.join(ROOT, "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx");
const BOARD = path.join(ROOT, "apps/frontend/src/pages/dispatch/DispatchBoard.tsx");
const DISPATCH_PAGE = path.join(ROOT, "apps/frontend/src/pages/Dispatch.tsx");
const CMDK = path.join(ROOT, "apps/frontend/src/components/shared/CmdKQuickSwitcher.tsx");

function fail(msg) {
  console.error(`${LABEL}: FAIL — ${msg}`);
  process.exit(1);
}

function read(p) {
  if (!fs.existsSync(p)) fail(`missing file ${path.relative(ROOT, p)}`);
  return fs.readFileSync(p, "utf8");
}

const drawer = read(DRAWER);
// Feature string must not include noopener when the handle is used (write/opener=null path).
if (/window\.open\([^)]*noopener/.test(drawer)) {
  fail(
    `LoadDetailDrawer still passes noopener in window.open feature string — that always returns null. ` +
      `Use noreferrer only and set win.opener = null after open (ROUND 203 F1).`
  );
}
if (!/win\.opener\s*=\s*null/.test(drawer) && !/popup\.opener\s*=\s*null/.test(drawer)) {
  fail(`LoadDetailDrawer must set opener = null after open (ROUND 203 F1 isolation without noopener feature).`);
}

const board = read(BOARD);
if (board.includes('queryKey: ["dispatch", "loads"]') || board.includes("queryKey: ['dispatch', 'loads']")) {
  fail(
    `DispatchBoard still invalidates ["dispatch","loads"] which matches nothing. ` +
      `Use ["loads"], ["dispatch","units-without-load"], ["dispatch-board"] (ROUND 203 F2).`
  );
}
for (const key of ['["loads"]', '["dispatch", "units-without-load"]', '["dispatch-board"]']) {
  if (!board.includes(`queryKey: ${key}`)) {
    fail(`DispatchBoard must invalidate queryKey: ${key} (ROUND 203 F2).`);
  }
}

const page = read(DISPATCH_PAGE);
if (!page.includes("SectionErrorBoundary")) {
  fail(`Dispatch.tsx must import/use SectionErrorBoundary (ROUND 203 F20).`);
}
for (const name of ["Dispatch board", "Dispatch kanban", "Load detail drawer"]) {
  if (!page.includes(`name="${name}"`)) {
    fail(`Dispatch.tsx must wrap surface with <SectionErrorBoundary name="${name}"> (ROUND 203 F20).`);
  }
}

const cmdk = read(CMDK);
if (!cmdk.includes('name="CmdK results"')) {
  fail(`CmdKQuickSwitcher must wrap results in <SectionErrorBoundary name="CmdK results"> (ROUND 203 F20).`);
}

console.log(
  `${LABEL}: PASS — noopener dropped where handle is used; real invalidation keys present; SectionErrorBoundary wraps board/kanban/drawer/CmdK.`
);
process.exit(0);
