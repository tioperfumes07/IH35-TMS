#!/usr/bin/env node
// DISPATCH-UI-REFINE-2 ITEM 2 guard: Kanban cards for loads WITH a unit render the UNIT as the primary
// line and the LOAD # as the secondary line (Assigned..Completed lanes). Loads without a unit keep load # primary.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => { console.error(`FAIL verify-dispatch-card-unit-first: ${m}`); process.exit(1); };
const src = readFileSync(join(root, "apps/frontend/src/components/dispatch/DispatchKanban.tsx"), "utf8");
if (!/function cardPrimaryLabel\([^)]*\)[^{]*{\s*return load\.assigned_unit_number \|\| load\.load_number;/.test(src))
  fail("cardPrimaryLabel must return unit number first, load # fallback");
if (!/function cardSecondaryLoadNumber\([^)]*\)[^{]*{\s*[\s\S]*?return load\.assigned_unit_number \? load\.load_number : null;/.test(src))
  fail("cardSecondaryLoadNumber must surface load # only when a unit occupies the primary line");
if ((src.match(/data-kanban-card-primary="unit"/g) || []).length < 2)
  fail('both Standard and Detailed cards must mark the primary line data-kanban-card-primary="unit"');
if ((src.match(/data-kanban-card-secondary="load-number"/g) || []).length < 2)
  fail('both Standard and Detailed cards must mark the load # data-kanban-card-secondary="load-number"');
// Detailed card header must no longer hardcode the load # as the primary bold line.
if (/<div className="font-semibold text-gray-900">\{load\.load_number\}<\/div>/.test(src))
  fail("Detailed card must use cardPrimaryLabel (unit-first), not a hardcoded load_number primary");
console.log("PASS verify-dispatch-card-unit-first");
