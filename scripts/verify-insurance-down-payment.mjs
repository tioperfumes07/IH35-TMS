#!/usr/bin/env node
// Guard (INSURANCE): the Create-Policy wizard must collect a Down Payment and send
// down_payment_cents (schema column exists; the field must not silently disappear).
import { readFileSync } from "node:fs";
const F = "apps/frontend/src/components/insurance/PolicyCreateWizard.tsx";
const failures = [];
let s = "";
try { s = readFileSync(F, "utf8"); } catch { failures.push(`${F}: missing`); }
if (s) {
  if (!/Down Payment/.test(s)) failures.push(`${F}: Down Payment field label missing`);
  if (!/down_payment_cents/.test(s)) failures.push(`${F}: must send down_payment_cents in the create payload`);
}
if (failures.length) { console.error("verify:insurance-down-payment — FAIL"); for (const f of failures) console.error("  - " + f); process.exit(1); }
console.log("verify:insurance-down-payment — OK (down payment field present + sent)");
