#!/usr/bin/env node
// Book Load stop ADDRESS entry guard. Functional lock: the stop's "Address" cell is the flag-gated
// PC*MILER geocoding input (data-stop-address-oneline), and the parsed city/state/country fields are kept.
//
// render-v6 §C (GUARD render-truth spec, 2026-06-23): the stop card is a TWO-ROW grid; "Address" is the
// first cell of Row 1 (.locrow: Address · City · St · Zip Code · Date · Time) — no longer the standalone
// full-width "Address (one line)" line of the interim DISPATCH-UI-REFINE-2 layout. So this guard now locks
// the geocode FUNCTION (input + parsed fields), not the obsolete full-width label/col-span.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => { console.error(`FAIL verify-bookload-stop-address-oneline: ${m}`); process.exit(1); };
const src = readFileSync(join(root, "apps/frontend/src/pages/dispatch/components/BookLoadStopsSection.tsx"), "utf8");
// The geocode address marker (plain attribute #1134 or via the geocode input's dataAttrs prop).
if (!/data-stop-address-oneline/.test(src)) fail("the geocoding address input (data-stop-address-oneline) must exist");
// The address cell must use the flag-gated geocoding input (plain text when the flag is OFF).
if (!/AddressGeocodeInput/.test(src)) fail("the address cell must use AddressGeocodeInput (flag-gated geocoding; plain text when OFF)");
// render-v6 §C: the address cell lives in the locrow grid.
if (!/stop-locrow-/.test(src)) fail("the address must live in the render-v6 §C locrow grid (stop-locrow-*)");
// parsed fields kept (additive — not deleted).
for (const f of ["city", "state", "country"]) {
  if (!new RegExp(`stops\\.\\$\\{index\\}\\.${f}`).test(src)) fail(`parsed ${f} field must be kept (additive)`);
}
console.log("PASS verify-bookload-stop-address-oneline");
