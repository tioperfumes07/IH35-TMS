#!/usr/bin/env node
// PCMILER guard: nothing calls Trimble unless PCMILER_ENABLED is on. Backend route checks the flag before
// the Trimble call; the actual Trimble HTTP call lives only in the client; the frontend gates on the flag.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => { console.error(`FAIL verify-pcmiler-flag-gated: ${m}`); process.exit(1); };
const r = (p) => readFileSync(join(root, p), "utf8");

const client = r("apps/backend/src/integrations/trimble/trimble-maps-client.ts");
if (!/PCMILER_ENABLED.*===.*"true"|process\.env\.PCMILER_ENABLED/.test(client)) fail("isPcmilerEnabled must read PCMILER_ENABLED");
// Only the client makes the Trimble HTTP call.
if (!/fetch\(\s*url/.test(client) && !/await fetch\(/.test(client)) fail("trimble client must perform the Trimble fetch");

const route = r("apps/backend/src/integrations/trimble/geocoding.routes.ts");
if (!/isPcmilerEnabled\(\)/.test(route)) fail("geocoding route must check isPcmilerEnabled() before geocoding");
if (!/if \(!isPcmilerEnabled\(\) \|\| !isTrimbleConfigured\(\)\)/.test(route)) fail("route must early-return when flag OFF or key missing");
// The Trimble call (singleSearchGeocode) must come AFTER the flag gate in the handler.
const gateIdx = route.indexOf("isPcmilerEnabled()");
const callIdx = route.indexOf("singleSearchGeocode(");
if (gateIdx < 0 || callIdx < 0 || callIdx < gateIdx) fail("singleSearchGeocode must only run after the PCMILER_ENABLED gate");

// Trimble HTTP call exists only in the backend client (not elsewhere in backend).
const fe = r("apps/frontend/src/components/dispatch/AddressGeocodeInput.tsx");
if (!/useFeatureFlag\("PCMILER_ENABLED"\)/.test(fe)) fail("frontend geocode input must gate on useFeatureFlag('PCMILER_ENABLED')");
if (!/if \(!enabled\)/.test(fe)) fail("frontend must skip geocoding when the flag is off");
console.log("PASS verify-pcmiler-flag-gated");
