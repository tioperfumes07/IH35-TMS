#!/usr/bin/env node
/**
 * GUARD — every CC-3 engine resolves Samsara driver <-> local driver through the CANONICAL map
 * mdata.driver_samsara_accounts (one driver, many Samsara accounts), never the legacy
 * mdata.drivers.samsara_driver_id column or the ingestion mirror.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const SRC = "apps/backend/src/";
const FILES = [
  "integrations/samsara/driver-samsara-map.ts",
  "safety/samsara-dvir-ingest.service.ts",
  "driver-profile/driver-profile-tabs.service.ts",
  "integrations/samsara/routes-integration.service.ts",
  "integrations/samsara/messaging/driver-message-delivery.service.ts",
  "telematics/fuel-efficiency-signal.service.ts",
  "telematics/driven-miles-legs.service.ts",
  "integrations/samsara/samsara-master-sync.service.ts",
];
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

export function check(srcs) {
  const p = [];
  for (const [f, raw] of Object.entries(srcs)) {
    const s = stripComments(raw);
    if (!/driver_samsara_accounts|loadDriverIdBySamsaraId|loadSamsaraIdsByDriverId/.test(s)) p.push(`${f} no longer resolves drivers through the canonical map.`);
    if (/FROM integrations\.samsara_drivers sd[\s\S]{0,200}local_driver_id/.test(s)) p.push(`${f} resolves drivers through the ingestion mirror.`);
    if (/d\.samsara_driver_id::text AS sid FROM mdata\.drivers d/.test(s)) p.push(`${f} resolves drivers through the legacy mdata.drivers.samsara_driver_id column.`);
  }
  return p;
}

const load = () => Object.fromEntries(FILES.map((f) => [f, readFileSync(resolve(ROOT, SRC + f), "utf8")]));

function selftest() {
  const g = load();
  const k = "telematics/fuel-efficiency-signal.service.ts";
  const cases = [
    [g, false],
    [{ ...g, [k]: g[k].replaceAll("loadDriverIdBySamsaraId", "x") }, true],
    [{ ...g, [k]: g[k] + "\nconst q = `SELECT d.samsara_driver_id::text AS sid FROM mdata.drivers d`;" }, true],
  ];
  return cases.every(([s, f]) => (check(s).length > 0) === f);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--selftest")) {
    const ok = selftest();
    console.log(`verify-cc3-driver-resolution-uses-canonical-map selftest ${ok ? "PASS" : "FAIL"}`);
    process.exit(ok ? 0 : 1);
  }
  const p = check(load());
  console.log(p.length ? `verify-cc3-driver-resolution-uses-canonical-map FAILED:\n  - ${p.join("\n  - ")}` : "verify-cc3-driver-resolution-uses-canonical-map: OK -- 8 engines resolve drivers through mdata.driver_samsara_accounts.");
  process.exit(p.length ? 1 : 0);
}
