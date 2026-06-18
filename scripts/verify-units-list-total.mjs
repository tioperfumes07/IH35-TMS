#!/usr/bin/env node
// Guard (GO-LIVE Block 1A regression lock): the units list returns a real server-side `total` on BOTH
// paths (truck-only AND the unified include=trailers path), and the Fleet page uses that total — so the
// pager shows the FULL fleet, never "of 50" (the page size). Regressing to a bare `return { units }`
// (no total) re-hides the rest of the fleet.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => { console.error(`FAIL verify-units-list-total: ${m}`); process.exit(1); };
const r = (p) => readFileSync(join(root, p), "utf8");

const routes = r("apps/backend/src/mdata/units.routes.ts");
// The trailers/unified path must NOT return a bare { units } (no total).
if (/return \{ units \};/.test(routes)) fail("units list must NOT return a bare { units } — include total (was 'of 50')");
// Both paths return { units: result.rows, total: result.total }.
if ((routes.match(/total: result\.total/g) || []).length < 2) fail("both units list paths must return total: result.total");

const svc = r("apps/backend/src/mdata/units-unified-list.service.ts");
if (!/Promise<\{ rows: UnifiedFleetRow\[\]; total: number \}>/.test(svc)) fail("fetchUnifiedFleetList must return { rows, total }");
if (!/total: merged\.length/.test(svc)) fail("fetchUnifiedFleetList total must be the full merged count (pre-paging)");

const page = r("apps/frontend/src/pages/maintenance/FleetTablePage.tsx");
if (!/payload\.total \?\? rows\.length/.test(page)) fail("FleetTablePage must read the server total (payload.total)");
if (!/totalRowsQuery\.data\?\.total|rowsQuery\.data\?\.total/.test(page)) fail("FleetTablePage count must use the server total");
console.log("PASS verify-units-list-total");
