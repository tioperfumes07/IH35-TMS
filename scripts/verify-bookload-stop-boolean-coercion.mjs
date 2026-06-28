#!/usr/bin/env node
// Guard (Lane A booking-400 fix): the Book Load V4 stop payload must coerce boolean stop fields to a
// STRICT boolean on the wire. RHF hidden inputs read as "" when empty; sending is_tarp_stop:"" /
// lumper_required:"" makes the backend Zod boolean 400 ("expected boolean, received string"). The
// payload builder must never send the raw form value for these — it must coerce. Locks the FE fix.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => { console.error(`FAIL verify-bookload-stop-boolean-coercion: ${m}`); process.exit(1); };
const f = "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx";
let src;
try { src = readFileSync(join(root, f), "utf8"); } catch { fail(`missing ${f}`); }

// The stop payload must NOT pass the raw form value for these booleans (that's what sent "").
for (const field of ["is_tarp_stop", "lumper_required"]) {
  const raw = new RegExp(`${field}:\\s*stop\\.${field}\\s*,`);
  if (raw.test(src)) {
    fail(`${f}: ${field} is sent raw (stop.${field}) — coerce to a strict boolean (=== true || === "true") so it is never "" on the wire`);
  }
  // Must coerce: `field: stop.field === true ...`
  const coerced = new RegExp(`${field}:\\s*stop\\.${field}\\s*===\\s*true`);
  if (!coerced.test(src)) {
    fail(`${f}: ${field} must be coerced to a strict boolean in the stop payload (e.g. stop.${field} === true || ... === "true")`);
  }
}
console.log("PASS verify-bookload-stop-boolean-coercion");
