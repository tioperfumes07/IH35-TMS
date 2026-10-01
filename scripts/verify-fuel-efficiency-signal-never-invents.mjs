#!/usr/bin/env node
/**
 * ROUND 304 T-50 — GUARD. "Probe the live response and report the real fields. Do not invent field names."
 * FAILS IF:
 *   1. SamsaraClient.listFuelEnergyReports reads a field that was not measured live
 *      (efficiencyMpge, fuelConsumedMl, distanceTraveledMeters, engineRunTimeDurationMs, engineIdleTimeDurationMs);
 *   2. fuel-efficiency-signal.service.ts stops gating purchased gallons through fuelPurchaseIneligibleReason;
 *   3. it flags a positive excess with an invented numeric tolerance (excess must compare against 0 only,
 *      because no tank capacity is on file).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const CLIENT = resolve(ROOT, "apps/backend/src/integrations/samsara/samsara-client.ts");
const SERVICE = resolve(ROOT, "apps/backend/src/telematics/fuel-efficiency-signal.service.ts");
const MEASURED = ["efficiencyMpge", "fuelConsumedMl", "distanceTraveledMeters", "engineRunTimeDurationMs", "engineIdleTimeDurationMs"];
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

export function check(clientRaw, serviceRaw) {
  const p = [];
  const m = stripComments(clientRaw).match(/async listFuelEnergyReports\([\s\S]*?\n  \}\n/);
  if (!m) p.push("SamsaraClient.listFuelEnergyReports is gone.");
  else {
    const read = [...m[0].matchAll(/\br\.([A-Za-z]+)/g)].map((x) => x[1]);
    for (const f of read) if (!MEASURED.includes(f) && f !== "vehicle" && f !== "driver") p.push(`listFuelEnergyReports reads unmeasured field r.${f}.`);
  }
  const svc = stripComments(serviceRaw);
  if (!/fuelPurchaseIneligibleReason\(f, \{ requirePumpTime: false \}\)/.test(svc)) p.push("purchased gallons are no longer gated by fuelPurchaseIneligibleReason.");
  if (!/status: excess > 0 \?/.test(svc)) p.push("excess is no longer compared against 0 -- a tolerance needs a tank capacity that is not on file.");
  return p;
}

function selftest() {
  const c = readFileSync(CLIENT, "utf8");
  const s = readFileSync(SERVICE, "utf8");
  const cases = [
    [c, s, false],
    [c.replace("num(r.efficiencyMpge)", "num(r.mpgInvented)"), s, true],
    [c, s.replaceAll("fuelPurchaseIneligibleReason(f,", "x(f,"), true],
    [c, s.replace("status: excess > 0 ?", "status: excess > 50 ?"), true],
  ];
  return cases.every(([a, b, f]) => (check(a, b).length > 0) === f);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--selftest")) {
    const ok = selftest();
    console.log(`verify-fuel-efficiency-signal-never-invents selftest ${ok ? "PASS" : "FAIL"}`);
    process.exit(ok ? 0 : 1);
  }
  const p = check(readFileSync(CLIENT, "utf8"), readFileSync(SERVICE, "utf8"));
  console.log(p.length ? `verify-fuel-efficiency-signal-never-invents FAILED:\n  - ${p.join("\n  - ")}` : "verify-fuel-efficiency-signal-never-invents: OK -- measured fields only, gated purchases, no invented tolerance.");
  process.exit(p.length ? 1 : 0);
}
