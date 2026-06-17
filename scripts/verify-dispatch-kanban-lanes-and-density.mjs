#!/usr/bin/env node
// DISPATCH-REDESIGN Part D guard.
// Locks the Kanban redesign so it cannot silently regress:
//   - Jorge's exact 10 lanes in order, plus "Cancelled" KEPT as a collapsed 11th lane
//     (additive-only: never delete a lane).
//   - A ~40px compact card variant (h-10) preserved so all 32 trucks fit when chosen.
//   - A density toggle (compact | standard | detailed) — DISPATCH-UI-REFINE-2 ITEM 1 added "Standard"
//     as the new default; Compact + Detailed cards are preserved (additive).
//   - A Fleet out-of-service strip pinned at the bottom of the board.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const file = join(root, "apps/frontend/src/components/dispatch/DispatchKanban.tsx");
const src = readFileSync(file, "utf8");

const fail = (msg) => {
  console.error(`FAIL verify-dispatch-kanban-lanes-and-density: ${msg}`);
  process.exit(1);
};

// 1. Ten lanes in exact order + Cancelled kept as 11th.
const expectedLanes = [
  "awaiting_assignment", "booked_unassigned", "assigned", "dispatched", "at_pickup",
  "loaded", "in_transit", "at_delivery", "delivered", "completed", "cancelled",
];
const start = src.indexOf("const KANBAN_STATUS_GROUPS");
const end = src.indexOf("];", start);
if (start < 0 || end < 0) fail("could not locate KANBAN_STATUS_GROUPS");
const block = src.slice(start, end);
const keys = [...block.matchAll(/key:\s*"([a-z_]+)"/g)].map((m) => m[1]);
if (keys.join(",") !== expectedLanes.join(",")) {
  fail(`lane order drifted.\n  expected: ${expectedLanes.join(",")}\n  found:    ${keys.join(",")}`);
}
if (!/key:\s*"cancelled"[\s\S]{0,160}collapsedByDefault:\s*true/.test(block)) {
  fail("Cancelled lane must be KEPT as a collapsed lane (additive-only)");
}

// 2. Compact ~40px card preserved + density toggle. DISPATCH-UI-REFINE-2 ITEM 1 (authorized by Jorge):
//    a third "Standard" density was added and is now the DEFAULT (was compact). The authoritative
//    3-density assertion lives in verify-dispatch-kanban-densities; here we keep the default-density lock
//    aligned to the new spec so it can't silently regress.
if (!src.includes("KanbanCompactCard")) fail("compact card component missing");
if (!src.includes("h-10")) fail("compact card must be ~40px tall (h-10)");
if (!/useState<KanbanDensity>\(KANBAN_DEFAULT_DENSITY\)/.test(src)) fail("density state must use KanbanDensity / KANBAN_DEFAULT_DENSITY");
if (!/KANBAN_DEFAULT_DENSITY:\s*KanbanDensity\s*=\s*"standard"/.test(src)) fail("density must default to standard (DISPATCH-UI-REFINE-2 ITEM 1)");
if (!src.includes("KanbanStandardCard")) fail("Standard density card must exist (additive)");
if (!src.includes("KanbanDispatchCard")) fail("detailed card must be preserved (additive)");

// 3. Fleet out-of-service strip pinned at the bottom.
if (!src.includes("dispatch-kanban-oos-strip")) fail("Fleet out-of-service strip missing");
if (!/sticky bottom-0[\s\S]{0,400}Fleet out of service/.test(src)) fail("OOS strip must be pinned (sticky bottom-0)");

// 4. Lane 1 "Awaiting assignment" is TRUCK-derived (roster minus loaded), not status-derived loads.
if (!src.includes("awaitingTrucks")) fail("Awaiting lane must accept truck roster (awaitingTrucks prop)");
if (!src.includes("truckToKanbanLoad")) fail("Awaiting lane must render trucks via truckToKanbanLoad");
if (!/key:\s*"awaiting_assignment",\s*title:\s*"Awaiting assignment",\s*statuses:\s*\[\]/.test(src)) {
  fail("awaiting_assignment lane must match NO load status (statuses: []) — it is truck-derived");
}
if (!/awaiting_assignment"\s*\?\s*awaitingTruckCards/.test(src)) fail("Awaiting column must render awaitingTruckCards");

console.log("PASS verify-dispatch-kanban-lanes-and-density");
