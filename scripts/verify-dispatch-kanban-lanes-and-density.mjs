#!/usr/bin/env node
// DISPATCH-REDESIGN Part D guard.
// Locks the Kanban redesign so it cannot silently regress:
//   - Jorge's exact 10 lanes in order, plus "Cancelled" KEPT as a collapsed 11th lane
//     (additive-only: never delete a lane).
//   - A ~40px compact card variant (h-10) used by default so all 32 trucks fit.
//   - A density toggle (compact | detailed) — the detailed card is preserved.
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

// 2. Compact ~40px card + density toggle, compact is the default.
if (!src.includes("KanbanCompactCard")) fail("compact card component missing");
if (!src.includes("h-10")) fail("compact card must be ~40px tall (h-10)");
if (!/useState<"compact" \| "detailed">\("compact"\)/.test(src)) fail("density must default to compact");
if (!src.includes("KanbanDispatchCard")) fail("detailed card must be preserved (additive)");

// 3. Fleet out-of-service strip pinned at the bottom.
if (!src.includes("dispatch-kanban-oos-strip")) fail("Fleet out-of-service strip missing");
if (!/sticky bottom-0[\s\S]{0,400}Fleet out of service/.test(src)) fail("OOS strip must be pinned (sticky bottom-0)");

console.log("PASS verify-dispatch-kanban-lanes-and-density");
