#!/usr/bin/env node
/**
 * DISPATCH #12 (owner 2026-09-04): "each individual column we cannot adjust width." Kanban lanes
 * were fixed at a density-derived min-width with flex-1 growth, so a dispatcher could never widen
 * a busy lane to read long load/route text. Each lane must expose a pointer-drag resize handle,
 * the parent must own a per-lane width map, and that width must persist across reloads
 * (localStorage) so the operator's board layout survives a refresh.
 *
 * Self-testing static guard. Run: node scripts/verify-dispatch-kanban-column-resize.mjs [--selftest]
 */
import fs from "node:fs";

const file = "apps/frontend/src/components/dispatch/DispatchKanban.tsx";
const original = fs.readFileSync(file, "utf8");

const contracts = [
  [
    "each lane renders a resize handle on its right edge",
    (s) => /kanban-column-resize-\$\{column\.key\}/.test(s) && /cursor-col-resize/.test(s),
    (s) => s.replaceAll("cursor-col-resize", "cursor-default"),
  ],
  [
    "resize handle drives onResize via a pointer-drag gesture",
    (s) => /onPointerDown=\{onResizePointerDown\}/.test(s) && /onResize\(column\.key,/.test(s),
    (s) => s.replaceAll("onResize(column.key,", "void (column.key,"),
  ],
  [
    "a set width overrides flex-1 min-width with an explicit px width",
    // LEAD 443.99 class B (2026-10-12):
    //   old rule: the set-width style literal starts with the width — width ? { width: `${width}px` ...
    //   new rule: the set-width style object (optionally spreading the locked KANBAN_COLUMN_STYLE first) carries
    //             width: `${width}px` AND flex: "0 0 auto" in the same object.
    //   why: #23282 (5f292613f4) spread the locked lane surface/border into the column style
    //        ({ ...KANBAN_COLUMN_STYLE, width: `${width}px`, flex: "0 0 auto" }); the width override is unchanged.
    //        Still fails if the px width or the flex override is dropped.
    (s) => /width\s*\?\s*\{\s*(?:\.\.\.KANBAN_COLUMN_STYLE,\s*)?width:\s*`\$\{width\}px`,\s*flex:\s*"0 0 auto"\s*\}/.test(s),
    (s) => s.replaceAll('flex: "0 0 auto"', "flex: undefined"),
  ],
  [
    "parent owns a persisted per-lane width map (clamped)",
    (s) =>
      /const\s*\[\s*columnWidths\s*,\s*setColumnWidths\s*\]\s*=\s*useState/.test(s) &&
      /localStorage\.setItem\("ih35\.kanban\.columnWidths"/.test(s) &&
      /Math\.max\(180,\s*Math\.min\(560,/.test(s),
    (s) => s.replaceAll('localStorage.setItem("ih35.kanban.columnWidths"', 'void ("ih35.kanban.columnWidths"'),
  ],
  [
    "width + onResize are wired into every mapped lane",
    (s) => /width=\{columnWidths\[group\.key\]\}/.test(s) && /onResize=\{setColumnWidth\}/.test(s),
    (s) => s.replaceAll("onResize={setColumnWidth}", "onResize={undefined}"),
  ],
];

function audit(s) {
  return contracts.filter(([, test]) => !test(s)).map(([name]) => name);
}

const failures = audit(original);
if (failures.length) {
  console.error(`[verify-dispatch-kanban-column-resize] FAILED\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const [name, , mutate] of contracts) {
    if (audit(mutate(original)).includes(name)) caught += 1;
    else throw new Error(`selftest failed to catch: ${name}`);
  }
  console.log(`[verify-dispatch-kanban-column-resize] SELFTEST PASS — ${caught}/${contracts.length} mutations detected`);
  process.exit(0);
}

console.log("[verify-dispatch-kanban-column-resize] OK");
