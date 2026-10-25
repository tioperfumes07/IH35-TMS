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
    // KANBAN-DRAG-OVERLAY (owner 10-25 2:12 PM): lanes are overflow-y-auto, so a card moved by its own transform is
    // clipped inside its lane and can never visibly reach another column. The drag preview must be a <DragOverlay>.
    "drag preview is a <DragOverlay> (renders outside the lanes' scroll containers) and no card moves by its own transform",
    (s) => /<DragOverlay\b/.test(s) && !/transform: `translate3d\(\$\{transform\.x\}px/.test(s),
    (s) => s.replace(/<DragOverlay\b[\s\S]*?<\/DragOverlay>/, ""),
  ],
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
    (s) => s.replace(/startsWith\("droppable:load:"\)/g, 'startsWith("droppable:DISABLED:")').replace("droppable:load:<id>", "droppable:DISABLED:<id>"),
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
  // REPOINTED (LEAD ROUND 443.187). 5f292613f4 "Claude-Lead — unblock main (2 red guards) + Kanban:
  // drag to At pickup / Loaded / At delivery, header contrast (#23282)" replaced derivedOnly on these
  // three lanes with `manualStamp`: a drop now writes the SAME manual stop stamp Truck Line writes
  // (stampTruckLineArrival / stampTruckLineDeparture), never a status transition. The rule this guard
  // owns is unchanged — a drop on these lanes must NEVER reach onStatusDrop as a same-state transition
  // the backend rejects — so it is asserted on the current mechanism: each lane carries its exact
  // stamp, and handleDragEnd takes the manualStamp branch (and returns) BEFORE the status-drop path.
  [
    "at_pickup lane records a manual pickup ARRIVAL stamp, never a status transition (5f292613f4)",
    (s) => /key:\s*"at_pickup"[^}]*manualStamp:\s*\{\s*stop:\s*"pickup",\s*event:\s*"arrive"\s*\}/.test(s),
    (s) => s.replace(/(key:\s*"at_pickup"[^\n]*?), manualStamp: \{ stop: "pickup", event: "arrive" \}/, "$1"),
  ],
  [
    "loaded lane records a manual pickup DEPARTURE stamp, never a status transition (5f292613f4)",
    (s) => /key:\s*"loaded"[^}]*manualStamp:\s*\{\s*stop:\s*"pickup",\s*event:\s*"depart"\s*\}/.test(s),
    (s) => s.replace(/(key:\s*"loaded"[^\n]*?), manualStamp: \{ stop: "pickup", event: "depart" \}/, "$1"),
  ],
  [
    "at_delivery lane records a manual delivery ARRIVAL stamp, never a status transition (5f292613f4)",
    (s) => /key:\s*"at_delivery"[^}]*manualStamp:\s*\{\s*stop:\s*"delivery",\s*event:\s*"arrive"\s*\}/.test(s),
    (s) => s.replace(/(key:\s*"at_delivery"[^\n]*?), manualStamp: \{ stop: "delivery", event: "arrive" \}/, "$1"),
  ],
  [
    "handleDragEnd takes the manualStamp branch (stamp route + return) before onStatusDrop (no same-state transition)",
    (s) => {
      const start = s.indexOf("const handleDragEnd");
      if (start === -1) return false;
      const body = s.slice(start, s.indexOf("\n  };", start) + 1);
      const branch = body.indexOf("if (targetGroup.manualStamp) {");
      const statusDrop = body.indexOf("await onStatusDrop(loadId");
      if (branch === -1 || statusDrop === -1 || branch > statusDrop) return false;
      const branchBody = body.slice(branch, body.indexOf("if (targetGroup.derivedOnly)", branch));
      return /stampTruckLineArrival\(/.test(branchBody) && /stampTruckLineDeparture\(/.test(branchBody) && /\n\s*return;\n\s*\}\s*$/.test(branchBody);
    },
    (s) => s.replace("if (targetGroup.manualStamp) {", "if (targetGroup.manualStamp && false) {"),
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
  "[verify-kanban-cross-column-drag-wired] OK — DndContext + PointerSensor + pointerWithin present, all 3 card densities register useDraggable/useDroppable, handleDragEnd resolves nested droppables and calls onStatusDrop, at_pickup/loaded/at_delivery record manual stop stamps before any status drop, synthetic unit: cards excluded from drag"
);
