#!/usr/bin/env node
// DISPATCH-UI-REFINE-2 ITEM 3 guard: Book Load section B (Equipment·Driver·Trailer) renders a driver
// HOS block bound to the selected driver, sourced from the in-app HOS store (no Samsara call).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => { console.error(`FAIL verify-bookload-section-b-hos: ${m}`); process.exit(1); };
const sec = readFileSync(join(root, "apps/frontend/src/pages/dispatch/components/BookLoadEquipmentSection.tsx"), "utf8");
if (!/import\s*\{\s*DriverHosClocksBlock\s*\}\s*from\s*"[^"]*hos\/DriverHosClocks"/.test(sec)) fail("must import DriverHosClocksBlock");
if (!/<DriverHosClocksBlock\s+driverId=\{primaryDriverId\}/.test(sec)) fail("section B must render DriverHosClocksBlock bound to the selected primary driver");
if (!/assignment_mode|assignmentMode === "team"/.test(sec) || !/secondaryDriverId/.test(sec)) fail("team mode must also show the team driver HOS");
const blk = readFileSync(join(root, "apps/frontend/src/components/dispatch/hos/DriverHosClocks.tsx"), "utf8");
if (!/getDriverHosStatus/.test(blk)) fail("HOS block must read from the in-app HOS store (getDriverHosStatus, #1109)");
if (!/No HOS data/.test(blk)) fail('HOS block must show "No HOS data" when the store has no events (never fabricate)');
console.log("PASS verify-bookload-section-b-hos");
