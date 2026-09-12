#!/usr/bin/env node
/**
 * ROUND 20.3 KANBAN DRAG ACTIVATION (Claude Lead, owner-live 2026-09-12, verbatim: "in kanban, the
 * loads are still not dragablle from one column to the next").
 *
 * ROOT CAUSE (measured live, app.ih35dispatch.com/dispatch?tab=kanban): the drag machinery was NOT
 * dead — an instrumented 14-step pointermove sequence produced real dnd-kit over/drop events and a
 * successful move. A single FAST, human-speed drag produced "Picked up draggable item ..." and then
 * NOTHING — no over, no drop, no toast, no state change, and the browser text-selected the card
 * instead. dnd-kit REQUIRES touch-action:none on the draggable node itself; without it, a real-speed
 * press-and-move gets raced and swallowed by the browser's own native text-selection/scroll gesture.
 * Verified live: getComputedStyle(card).touchAction === "auto" before this fix.
 *
 * This guard asserts the SOURCE WIRING that makes a human-speed drag actually activate:
 *   1. Every draggable card variant (KanbanDispatchCard, KanbanCompactCard, KanbanStandardCard,
 *      AwaitingTruckCard) sets touchAction:"none" on the node it spreads useDraggable's
 *      attributes/listeners onto, while draggable.
 *   2. The PointerSensor's activationConstraint uses a LOWER distance (4, not 8) so a real drag
 *      crosses the threshold before the native selection gesture starts.
 *   3. DndContext wires onDragStart (forces document.body.style.userSelect='none' for the drag's
 *      duration) and onDragCancel (clears it AND surfaces the same neutral toast a missed drop uses
 *      — a silent cancel is exactly what the owner experienced).
 *
 * Self-testing static guard. Run: node scripts/verify-kanban-drag-touch-action.mjs [--selftest]
 */
import fs from "node:fs";

const file = "apps/frontend/src/components/dispatch/DispatchKanban.tsx";
const original = fs.readFileSync(file, "utf8");

function sliceFunction(s, startMarker, endMarker) {
  const start = s.indexOf(startMarker);
  if (start === -1) return null;
  const end = endMarker ? s.indexOf(endMarker, start) : s.length;
  return s.slice(start, end === -1 ? s.length : end);
}

const contracts = [
  [
    "KanbanDispatchCard sets touchAction:\"none\" while draggableEnabled (detailed density)",
    (s) => {
      const body = sliceFunction(s, "function KanbanDispatchCard(", "function KanbanCompactCard");
      return body !== null && /draggableEnabled \? \{ touchAction: "none" as const \} : \{\}/.test(body);
    },
    (s) =>
      s.replace(
        '  const style = {\n    ...(transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : {}),\n    ...(draggableEnabled ? { touchAction: "none" as const } : {}),\n  };\n  const lane = toRouteSummary(load.first_pickup_city, load.first_delivery_city);\n  const commodity',
        '  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;\n  const lane = toRouteSummary(load.first_pickup_city, load.first_delivery_city);\n  const commodity',
      ),
  ],
  [
    "KanbanCompactCard sets touchAction:\"none\" while draggableEnabled",
    (s) => {
      const body = sliceFunction(s, "function KanbanCompactCard(", "function KanbanStandardCard");
      return body !== null && /draggableEnabled \? \{ touchAction: "none" as const \} : \{\}/.test(body);
    },
    (s) =>
      s.replace(
        '  const style = {\n    ...(transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : {}),\n    ...(draggableEnabled ? { touchAction: "none" as const } : {}),\n  };\n  const lane = toRouteSummary(load.first_pickup_city, load.first_delivery_city);\n\n  return',
        '  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;\n  const lane = toRouteSummary(load.first_pickup_city, load.first_delivery_city);\n\n  return',
      ),
  ],
  [
    "KanbanStandardCard sets touchAction:\"none\" while draggableEnabled",
    (s) => {
      const body = sliceFunction(s, "function KanbanStandardCard(", "function AwaitingTruckCard");
      return body !== null && /draggableEnabled \? \{ touchAction: "none" as const \} : \{\}/.test(body);
    },
    (s) =>
      s.replace(
        '  const style = {\n    ...(transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : {}),\n    ...(draggableEnabled ? { touchAction: "none" as const } : {}),\n  };\n  const lane = toRouteSummary(load.first_pickup_city, load.first_delivery_city);\n  const secondaryLoad',
        '  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;\n  const lane = toRouteSummary(load.first_pickup_city, load.first_delivery_city);\n  const secondaryLoad',
      ),
  ],
  [
    "AwaitingTruckCard sets touchAction:\"none\" unconditionally (BRD-12, always draggable)",
    (s) => {
      const body = sliceFunction(s, "function AwaitingTruckCard(", "function KanbanColumnSortControls");
      return body !== null && /touchAction: "none" as const,\s*\n\s*\};/.test(body);
    },
    (s) =>
      s.replace(
        '  const transformStyle = {\n    ...(transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : {}),\n    touchAction: "none" as const,\n  };',
        "  const transformStyle = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;",
      ),
  ],
  [
    "PointerSensor activationConstraint distance is 4 (lowered from 8, ROUND 20.3)",
    (s) => /useSensor\(PointerSensor, \{ activationConstraint: \{ distance: 4, tolerance: 5, delay: 0 \} \}\)/.test(s),
    (s) => s.replace("activationConstraint: { distance: 4, tolerance: 5, delay: 0 }", "activationConstraint: { distance: 8 }"),
  ],
  [
    "DndContext wires onDragStart (forces body userSelect:none for the drag's duration)",
    (s) => /<DndContext[\s\S]*?onDragStart=\{handleDragStart\}/.test(s) && /document\.body\.style\.userSelect = "none"/.test(s),
    (s) => s.replace('onDragStart={handleDragStart}\n', ""),
  ],
  [
    "DndContext wires onDragCancel (clears userSelect AND surfaces the same neutral missed-drop toast)",
    (s) => {
      const body = sliceFunction(s, "const handleDragCancel", "const handleDragEnd");
      return (
        /<DndContext[\s\S]*?onDragCancel=\{handleDragCancel\}/.test(s) &&
        body !== null &&
        /clearDragUserSelect\(\)/.test(body) &&
        /pushToast\("Drop the card onto a lane to change its status\."/.test(body)
      );
    },
    (s) => s.replace('onDragCancel={handleDragCancel}\n', ""),
  ],
  [
    "handleDragEnd also clears the drag userSelect override on completion (success or revert)",
    (s) => {
      const body = sliceFunction(s, "const handleDragEnd = async (event: DragEndEvent) => {", "const activeId");
      return body !== null && /clearDragUserSelect\(\);/.test(body);
    },
    (s) => s.replace("    clearDragUserSelect();\n    const activeId = event.active.id;", "    const activeId = event.active.id;"),
  ],
];

function audit(s) {
  return contracts.filter(([, test]) => !test(s)).map(([name]) => name);
}

const failures = audit(original);
if (failures.length) {
  console.error(`[verify-kanban-drag-touch-action] FAILED\n${failures.map((f) => ` - ${f}`).join("\n")}`);
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
  console.log(`[verify-kanban-drag-touch-action] SELFTEST PASS — ${caught}/${contracts.length} mutations detected`);
  process.exit(0);
}

console.log(
  "[verify-kanban-drag-touch-action] OK — all 4 draggable card variants set touchAction:none while draggable, activationConstraint distance lowered to 4, DndContext wires onDragStart/onDragCancel with userSelect cleanup + neutral cancel toast"
);
