#!/usr/bin/env node
/**
 * DISPATCH #15 (owner 2026-09-04): a Kanban lane with `collapsedByDefault` (the "Cancelled"
 * lane) rendered ONLY its header + count and never its cards, with no control to open it —
 * the cancelled loads were unreachable on the board. The lane must offer an expander (open)
 * and, once open, a collapser (close). The expand state must be gated so the collapsed branch
 * only short-circuits when NOT expanded.
 *
 * Self-testing static guard. Run: node scripts/verify-...mjs [--selftest]
 */
import fs from "node:fs";

const file = "apps/frontend/src/components/dispatch/DispatchKanban.tsx";
const original = fs.readFileSync(file, "utf8");

const contracts = [
  [
    "collapsed branch is gated by !expanded (not unconditional)",
    (s) => /if\s*\(\s*column\.collapsedByDefault\s*&&\s*!expanded\s*\)/.test(s),
    (s) => s.replace(/if\s*\(\s*column\.collapsedByDefault\s*&&\s*!expanded\s*\)/, "if (column.collapsedByDefault)"),
  ],
  [
    "expander button opens the lane (setExpanded(true))",
    (s) => /kanban-column-expander-\$\{column\.key\}/.test(s) && /setExpanded\(true\)/.test(s),
    (s) => s.replace("setExpanded(true)", "void 0"),
  ],
  [
    "collapser button closes the lane (setExpanded(false))",
    (s) => /kanban-column-collapser-\$\{column\.key\}/.test(s) && /setExpanded\(false\)/.test(s),
    (s) => s.replace("setExpanded(false)", "void 0"),
  ],
  [
    "expand state hook exists",
    (s) => /const\s*\[\s*expanded\s*,\s*setExpanded\s*\]\s*=\s*useState\(/.test(s),
    (s) => s.replace(/const\s*\[\s*expanded\s*,\s*setExpanded\s*\]\s*=\s*useState\(false\);?/, "const expanded = false;"),
  ],
];

function audit(s) {
  return contracts.filter(([, test]) => !test(s)).map(([name]) => name);
}

const failures = audit(original);
if (failures.length) {
  console.error(`[verify-dispatch-kanban-collapsed-lane-expander] FAILED\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const [name, , mutate] of contracts) {
    if (audit(mutate(original)).includes(name)) caught += 1;
    else throw new Error(`selftest failed to catch: ${name}`);
  }
  console.log(`[verify-dispatch-kanban-collapsed-lane-expander] SELFTEST PASS — ${caught}/${contracts.length} mutations detected`);
  process.exit(0);
}

console.log("[verify-dispatch-kanban-collapsed-lane-expander] OK");
