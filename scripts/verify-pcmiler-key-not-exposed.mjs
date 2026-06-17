#!/usr/bin/env node
// PCMILER guard: TRIMBLE_MAPS_API_KEY is SERVER-SIDE ONLY — never in the frontend bundle, never logged.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => { console.error(`FAIL verify-pcmiler-key-not-exposed: ${m}`); process.exit(1); };

// 1. The key must NOT appear anywhere in the frontend source.
function walk(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx|js|jsx)$/.test(e)) acc.push(p);
  }
  return acc;
}
for (const f of walk(join(root, "apps/frontend/src"))) {
  if (/TRIMBLE_MAPS_API_KEY/.test(readFileSync(f, "utf8"))) {
    fail(`TRIMBLE_MAPS_API_KEY referenced in frontend file ${f.replace(root + "/", "")} — key must never reach the browser`);
  }
}

// 2. The key is read only in the backend trimble client, and never logged.
const client = readFileSync(join(root, "apps/backend/src/integrations/trimble/trimble-maps-client.ts"), "utf8");
if (!/process\.env\.TRIMBLE_MAPS_API_KEY/.test(client)) fail("trimble-maps-client must read TRIMBLE_MAPS_API_KEY from env");
if (/console\.(log|info|warn|error)\([^)]*(apiKey|TRIMBLE_MAPS_API_KEY|authToken)/.test(client)) fail("the API key / authToken must never be logged");

// 3. The frontend only ever calls our own proxy, never Trimble directly.
const fe = readFileSync(join(root, "apps/frontend/src/components/dispatch/AddressGeocodeInput.tsx"), "utf8");
if (/singlesearch\.alk\.com|trimblemaps|authToken/i.test(fe)) fail("frontend must call our backend proxy, never Trimble directly");
console.log("PASS verify-pcmiler-key-not-exposed");
