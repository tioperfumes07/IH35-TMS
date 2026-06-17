#!/usr/bin/env node
// DISPATCH-UI-REFINE-2 ITEM 1 guard: Kanban has THREE densities (compact|standard|detailed) and
// Standard is the DEFAULT. Additive — Compact + Detailed are preserved.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => { console.error(`FAIL verify-dispatch-kanban-densities: ${m}`); process.exit(1); };
const src = readFileSync(join(root, "apps/frontend/src/components/dispatch/DispatchKanban.tsx"), "utf8");
for (const d of ["compact", "standard", "detailed"]) {
  if (!new RegExp(`"${d}"`).test(src)) fail(`density "${d}" missing`);
}
if (!/KanbanDensity\s*=\s*"compact"\s*\|\s*"standard"\s*\|\s*"detailed"/.test(src)) fail("KanbanDensity union must be compact|standard|detailed");
if (!/KANBAN_DEFAULT_DENSITY\s*:\s*KanbanDensity\s*=\s*"standard"/.test(src)) fail("Standard must be the default density (KANBAN_DEFAULT_DENSITY = 'standard')");
if (!/useState<KanbanDensity>\(KANBAN_DEFAULT_DENSITY\)/.test(src)) fail("density state must initialize to KANBAN_DEFAULT_DENSITY");
if (!/function KanbanStandardCard\(/.test(src)) fail("KanbanStandardCard (2-line standard card) missing");
if (!/KANBAN_DENSITIES\.map/.test(src)) fail("density toggle must iterate KANBAN_DENSITIES (all three)");
console.log("PASS verify-dispatch-kanban-densities");
