#!/usr/bin/env node
// DISPATCH-UI-REFINE-2 ITEM 4 guard: the Book Load stop address primary entry is a SINGLE full-width
// horizontal line (interim, pre-PC*MILER). Parsed city/state/country fields are kept behind it (additive).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => { console.error(`FAIL verify-bookload-stop-address-oneline: ${m}`); process.exit(1); };
const src = readFileSync(join(root, "apps/frontend/src/pages/dispatch/components/BookLoadStopsSection.tsx"), "utf8");
// The one-line address marker may be a plain attribute (#1134) or passed via the geocode input's
// dataAttrs prop (PCMILER-GEOCODE) — match either form.
if (!/data-stop-address-oneline/.test(src)) fail("a single one-line address input (data-stop-address-oneline) must exist");
// PCMILER-GEOCODE: the one-line address is now the flag-gated geocoding input (plain text when the flag is OFF).
if (!/AddressGeocodeInput/.test(src)) fail("the one-line address must use AddressGeocodeInput (flag-gated geocoding; plain text when OFF)");
// the one-line input must live in a full-width (md:col-span-2) container.
const idx = src.indexOf("data-stop-address-oneline");
const window = src.slice(Math.max(0, idx - 1200), idx);
if (!/md:col-span-2/.test(window)) fail("the one-line address input must span full width (md:col-span-2)");
// parsed fields kept (additive — not deleted).
for (const f of ["city", "state", "country"]) {
  if (!new RegExp(`stops\\.\\$\\{index\\}\\.${f}`).test(src)) fail(`parsed ${f} field must be kept (additive)`);
}
console.log("PASS verify-bookload-stop-address-oneline");
