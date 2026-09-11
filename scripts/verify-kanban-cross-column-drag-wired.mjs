#!/usr/bin/env node
/**
 * KANBAN-CROSS-COLUMN-DRAG (owner 2026-09-11, verbatim: "LOADED-TRUCK CARDS NOT MOVING LIVE").
 *
 * Root cause found live: the deployed frontend at app.ih35dispatch.com was STALE — it contained
 * ZERO dnd-kit code (no DndContext, useDraggable, useDroppable, pointerWithin, PointerSensor, or
 * `droppable:load:` strings in ANY of its 83 JS chunks) despite version.json claiming d54e980.
 * The local build from the same commit DID contain all of these. The deployed build was built from
 * an older commit before REG-018 (the drag-and-drop fix). This is why "cards don't move AT ALL" —
 * there was no drag code in the deployed build.
 *
 * SECONDARY: the at_pickup and at_delivery Kanban columns accepted drops but their dropStatus values
 * (at_pickup, at_delivery) map to the SAME dispatch state as their parent columns (dispatched,
 * in_transit) via toDispatchTransitionStatus, making same-state transitions invalid. These are now
 * derivedOnly: true like the Loaded lane — drops are refused with a telematics explanation instead of
 * a silent server rejection.
 *
 * This guard asserts the SOURCE WIRING that makes cross-column drag work:
 *   1. DndContext + PointerSensor + pointerWithin are present (the drag infrastructure exists).
 *   2. Every card density (compact, standard, detailed) registers useDraggable + useDroppable.
 *   3. handleDragEnd resolves `droppable:load:` overIds to a target column (nested droppable fix).
 *   4. handleDragEnd calls onStatusDrop (the API transition path is reached).
 *   5. at_pickup, at_delivery, and loaded lanes are derivedOnly (telematics-set, not drag-droppable).
 *   6. Synthetic "unit:" cards are excluded from load-status dragging.
 *
 * Self-testing static guard. Run: node scripts/verify-kanban-cross-column-drag-wired.mjs [--selftest]
 */
import fs from "node:fs";

const file = "apps/frontend/src/components/dispatch/DispatchKanban.tsx";
const original = fs.readFileSync(file, "utf8");

const contracts = [
  [
    "DndContext with PointerSensor and pointerWithin collision detection is present",
    (s) => /<DndContext/.test(s) && /PointerSensor/.test(s) && /pointerWithin/.test(s),
    (s) => s.replace(/pointerWithin/g, "closestCorners /* removed */"),
  ],
  [
    "KanbanCompactCard registers useDraggable (compact cards participate in drag)",
    (s) => {
      const start = s.indexOf("function KanbanCompactCard(");
      if (start === -1) return false;
      const body = s.slice(start, s.indexOf("function KanbanStandardCard", start));
      return /useDraggable/.test(body) && /useDroppable/.test(body);
    },
    (s) => s.replace("function KanbanCompactCard(", "function KanbanCompactCard_DISABLED("),
  ],
  [
    "KanbanStandardCard registers useDraggable (standard cards participate in drag)",
    (s) => {
      const start = s.indexOf("function KanbanStandardCard(");
      if (start === -1) return false;
      const body = s.slice(start, s.indexOf("function KanbanDispatchCard", start));
      return /useDraggable/.test(body) && /useDroppable/.test(body);
    },
    (s) => s.replace("function KanbanStandardCard(", "function KanbanStandardCard_DISABLED("),
  ],
  [
    "KanbanDispatchCard registers useDraggable (detailed cards participate in drag)",
    (s) => {
      const start = s.indexOf("function KanbanDispatchCard(");
      if (start === -1) return false;
      const body = s.slice(start, s.indexOf("function KanbanColumn", start));
      return /useDraggable/.test(body) && /useDroppable/.test(body);
    },
    (s) => s.replace("function KanbanDispatchCard(", "function KanbanDispatchCard_DISABLED("),
  ],
  [
    "handleDragEnd resolves droppable:load: overIds to a target column (nested droppable fix, REG-018)",
    (s) => {
      const start = s.indexOf("const handleDragEnd");
      if (start === -1) return false;
      const body = s.slice(start, s.indexOf("\n  };", start) + 1);
      return /startsWith\("droppable:load:"\)/.test(body) && /resolveKanbanColumnKey/.test(body);
    },
    (s) => s.replace('startsWith("droppable:load:")', 'startsWith("droppable:DISABLED:")').replace("droppable:load:<id>", "droppable:DISABLED:<id>"),
  ],
  [
    "handleDragEnd calls onStatusDrop (the API transition path is reached from drag)",
    (s) => {
      const start = s.indexOf("const handleDragEnd");
      if (start === -1) return false;
      const body = s.slice(start, s.indexOf("\n  };", start) + 1);
      return /await onStatusDrop\(loadId/.test(body);
    },
    (s) => s.replace("await onStatusDrop(loadId, nextStatus)", "await onStatusDrop_DISABLED(loadId, nextStatus)"),
  ],
  [
    "at_pickup lane is derivedOnly (telematics-set, not drag-droppable — KANBAN-CROSS-COLUMN-DRAG)",
    (s) => {
      const m = s.match(/key:\s*"at_pickup"[^}]*derivedOnly:\s*true/);
      return m !== null;
    },
    (s) => s.replace('key: "at_pickup", title: "At pickup", statuses: ["at_pickup"], dropStatus: "at_pickup", showDwell: true, derivedOnly: true', 'key: "at_pickup", title: "At pickup", statuses: ["at_pickup"], dropStatus: "at_pickup", showDwell: true'),
  ],
  [
    "at_delivery lane is derivedOnly (telematics-set, not drag-droppable — KANBAN-CROSS-COLUMN-DRAG)",
    (s) => {
      const m = s.match(/key:\s*"at_delivery"[^}]*derivedOnly:\s*true/);
      return m !== null;
    },
    (s) => s.replace('key: "at_delivery", title: "At delivery", statuses: ["at_delivery"], dropStatus: "at_delivery", showDwell: true, derivedOnly: true', 'key: "at_delivery", title: "At delivery", statuses: ["at_delivery"], dropStatus: "at_delivery", showDwell: true'),
  ],
  [
    "loaded lane is derivedOnly (telematics-set, not drag-droppable)",
    (s) => {
      const m = s.match(/key:\s*"loaded"[^}]*derivedOnly:\s*true/);
      return m !== null;
    },
    (s) => s.replace('key: "loaded", title: "Loaded", statuses: [], dropStatus: "in_transit", derivedOnly: true', 'key: "loaded", title: "Loaded", statuses: [], dropStatus: "in_transit"'),
  ],
  [
    "synthetic unit: cards are excluded from load-status dragging (LV-KANBAN-SYNTHETIC-CARD-INERT-DRAG)",
    (s) => /isSyntheticKanbanCardId/.test(s) && /canDragLoad\(load\.status\)\s*&&\s*!isSyntheticKanbanCardId/.test(s),
    (s) => s.replace(/!isSyntheticKanbanCardId\(load\.id\)/g, "true /* removed */"),
  ],
];

function audit(s) {
  return contracts.filter(([, test]) => !test(s)).map(([name]) => name);
}

const failures = audit(original);
if (failures.length) {
  console.error(`[verify-kanban-cross-column-drag-wired] FAILED\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const [name, , mutate] of contracts) {
    const mutated = mutate(original);
    if (mutated === original) {
      throw new Error(`selftest mutate() was a no-op for: ${name}`);
    }
    if (audit(mutated).includes(name)) caught += 1;
    else throw new Error(`selftest failed to catch: ${name}`);
  }
  console.log(`[verify-kanban-cross-column-drag-wired] SELFTEST PASS — ${caught}/${contracts.length} mutations detected`);
  process.exit(0);
}

console.log(
  "[verify-kanban-cross-column-drag-wired] OK — DndContext + PointerSensor + pointerWithin present, all 3 card densities register useDraggable/useDroppable, handleDragEnd resolves nested droppables and calls onStatusDrop, at_pickup/at_delivery/loaded are derivedOnly, synthetic unit: cards excluded from drag"
);
