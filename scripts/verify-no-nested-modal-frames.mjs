#!/usr/bin/env node
// verify-no-nested-modal-frames
//
// GAP: "nested-box modal pattern (double-frame headers)" — a modal shell (the shared `Modal`
// component, which renders its own single bordered header) wraps content that ALSO renders a
// second framed header (a `PageHeader` / `ModuleHeader`, which owns its own back-arrow + H1), or
// content that nests a second full modal/drawer shell inside it. That produces a visually nested
// double border ("box inside a box"), which violates the QBO-parity single-frame design (§7).
//
// This was fixed historically for WorkOrderDetailModal + CustomerDrillModal in
// P8-AUDIT-NESTED-MODALS (PR #462 / #853 / #907 / #916) — this guard makes that class of
// regression statically impossible to reintroduce, in any modal, going forward.
//
// Rule: inside the JSX subtree of a `<Modal ...> ... </Modal>` shell (the shared shell from
// `components/Modal.tsx`), the content must NOT render:
//   (a) a second `<PageHeader` or `<ModuleHeader` (the shell already owns the one header), or
//   (b) a nested `<Modal` / `<...Modal` shell (a second framed header stacked in the SAME visual
//       layer as the parent shell — a literal box-inside-a-box).
//
// Deliberately NOT flagged: components ending in `Drawer` (e.g. `InlineCreateDrawer`,
// `ParityDrawer`). A stackable side-drawer opening on top of a parent modal — "+ Add new ___"
// opens a mini-create without closing the parent panel — is the LOCKED product pattern (§7), a
// distinct slide-in overlay layer, not a nested box in the same content flow. Flagging it would be
// a false positive against a required design, not a defect.
//
// Self-test: --selftest (in-memory fixtures, no filesystem writes).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "apps/frontend/src");

const FRAME_TAG_RE = /^(PageHeader|ModuleHeader)$/;
const SHELL_TAG_RE = /Modal$/; // a second Modal-shaped component nested inside (Drawer is exempt — see header note)

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "__tests__") continue;
      out.push(...walk(p));
    } else if (/\.(tsx|jsx)$/.test(entry.name) && !/\.(test|spec)\.(tsx|jsx)$/.test(entry.name)) {
      out.push(p);
    }
  }
  return out;
}

/**
 * Scan one source string for the double-frame violation: a shared `<Modal ...>` element whose
 * descendant JSX (anywhere in the subtree, not just direct children) contains a second
 * PageHeader/ModuleHeader, or a second Modal/Drawer-shaped shell.
 * Returns an array of { tagName, line } violations (1-based line numbers when a sourceFile is given).
 */
export function findViolations(source, fileName = "fixture.tsx") {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
  const violations = [];

  function tagNameOf(node) {
    // JsxElement -> openingElement.tagName; JsxSelfClosingElement -> tagName.
    if (ts.isJsxElement(node)) return node.openingElement.tagName.getText();
    if (ts.isJsxSelfClosingElement(node)) return node.tagName.getText();
    return null;
  }

  function isSharedModalShell(node) {
    // Only the literal shared shell `<Modal ...>` (not `<FooModal>`, which is content wrapping the
    // shared shell itself — that inner usage gets checked independently when visited).
    return ts.isJsxElement(node) && tagNameOf(node) === "Modal";
  }

  /** Walk a subtree (excluding the root itself) looking for a second frame. */
  function scanForNestedFrame(root) {
    const found = [];
    function inner(node) {
      if (node !== root) {
        const tag = tagNameOf(node);
        if (tag && (FRAME_TAG_RE.test(tag) || (SHELL_TAG_RE.test(tag) && tag !== "ModalCloseButton"))) {
          found.push(tag);
        }
      }
      ts.forEachChild(node, inner);
    }
    ts.forEachChild(root, inner);
    return found;
  }

  function visit(node) {
    if (isSharedModalShell(node)) {
      const nested = scanForNestedFrame(node);
      if (nested.length > 0) {
        const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        for (const tag of nested) {
          violations.push({ tagName: tag, line: pos.line + 1 });
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return violations;
}

function run() {
  const failures = [];
  for (const file of walk(SRC)) {
    const source = fs.readFileSync(file, "utf8");
    if (!/<Modal[\s>]/.test(source)) continue; // fast skip: no shared Modal shell used here
    const violations = findViolations(source, file);
    for (const v of violations) {
      failures.push(
        `${path.relative(ROOT, file)}:${v.line} — shared <Modal> shell contains a nested <${v.tagName}> ` +
          `(double-frame: the Modal shell already renders one header; a second ${
            FRAME_TAG_RE.test(v.tagName) ? "PageHeader/ModuleHeader" : "Modal shell"
          } inside it produces a box-inside-a-box). Render body-only content inside <Modal>; let the shell own the single header.`
      );
    }
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const cases = [
    [
      "clean: Modal with plain body content",
      `<Modal open onClose={close} title="Work Order Details"><div className="space-y-3"><p>Status: open</p></div></Modal>`,
      0,
    ],
    [
      "clean: Modal wrapping a section with a border-top divider (not a second frame)",
      `<Modal open onClose={close} title="X"><section className="border-t border-gray-100 pt-3"><p>Body</p></section></Modal>`,
      0,
    ],
    [
      "violation: Modal wrapping content that renders its own PageHeader",
      `<Modal open onClose={close} title="Customer"><PageHeader title="Customer" /><div>body</div></Modal>`,
      1,
    ],
    [
      "violation: Modal wrapping content that renders its own ModuleHeader",
      `<Modal open onClose={close} title="X"><div><ModuleHeader title="X" /></div></Modal>`,
      1,
    ],
    [
      "violation: Modal nesting a second Modal shell",
      `<Modal open onClose={close} title="Outer"><Modal open onClose={close} title="Inner">body</Modal></Modal>`,
      1,
    ],
    [
      "clean: Modal stacking an InlineCreateDrawer (locked '+ Add new' slide-in pattern, §7 — NOT a double-frame)",
      `<Modal open onClose={close} title="Manual Journal Entry"><div><SelectCombobox /></div><InlineCreateDrawer open kind="account" operatingCompanyId={id} onClose={close} onCreated={fn} /></Modal>`,
      0,
    ],
    [
      "clean: Modal stacking a XxxDetailDrawer (side-panel overlay, not a nested box)",
      `<Modal open onClose={close} title="X"><FineDetailDrawer open fine={f} onClose={close} /></Modal>`,
      0,
    ],
    [
      "clean: ModalCloseButton inside Modal is not a frame (it's the shell's own close control)",
      `<Modal open onClose={close} title="X"><div><ModalCloseButton title="X" onClose={close} /></div></Modal>`,
      0,
    ],
    [
      "clean: a FooModal component (content wrapper) rendering the shared Modal once is fine on its own",
      `<Modal open onClose={close} title="Road service ticket"><SelectCombobox /></Modal>`,
      0,
    ],
  ];

  const checks = cases.map(([name, src, want]) => [name, findViolations(src).length === want]);
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("verify:no-nested-modal-frames --selftest FAIL:");
    for (const [name] of failed) console.error("  ✗ " + name);
    process.exit(1);
  }
  console.log(`verify:no-nested-modal-frames --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = run();
  if (failures.length > 0) {
    console.error("verify:no-nested-modal-frames FAIL:");
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log("verify:no-nested-modal-frames: ok (no shared Modal shell renders a nested double-frame)");
}
