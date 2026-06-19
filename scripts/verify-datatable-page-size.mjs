#!/usr/bin/env node
// Guard — universal rows-per-page (Jorge: EVERY list lets the user choose how many rows show). The shared DataTable
// must expose a persisted rows-per-page selector (10/25/50/100/All); the Drivers roster (the surface GUARD flagged)
// must opt into persistence via tableKey. Locks the selector + persistence so a bespoke pager can't drop it again.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const fail = (m) => { console.error(`FAIL verify-datatable-page-size: ${m}`); process.exit(1); };

const dt = read("apps/frontend/src/components/DataTable.tsx");
if (!/aria-label="Rows per page"/.test(dt)) fail("DataTable must render a 'Rows per page' selector");
if (!/PAGE_SIZE_OPTIONS = \[10, 25, 50, 100, -1\]/.test(dt))
  fail("DataTable rows-per-page options must be 10/25/50/100/All (-1)");
if (!/useTablePref\(tableKey \?\? /.test(dt) || !/if \(tableKey\) pref\.setPageSize/.test(dt))
  fail("DataTable rows-per-page must persist per-surface via useTablePref when tableKey is set");
if (!/selectedPageSize === ALL_SENTINEL/.test(dt))
  fail('DataTable must support the "All" rows option');

const drivers = read("apps/frontend/src/pages/Drivers.tsx");
if (!/tableKey="drivers-roster"/.test(drivers))
  fail("the Drivers roster DataTable must set tableKey so the rows-per-page choice persists (the surface GUARD flagged)");

console.log("OK verify-datatable-page-size: shared DataTable has a persisted rows-per-page selector; Drivers roster opted in.");
