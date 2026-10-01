#!/usr/bin/env node
/**
 * LEAD DECISION 2026-10-01 — GUARD. The Samsara master sync is LINK-ONLY:
 *   1. it never INSERTs into mdata.drivers / mdata.units / mdata.equipment;
 *   2. vehicles never write mdata.equipment (trucks are not trailers);
 *   3. each pass takes a per-company advisory lock (one runner, no deadlocks);
 *   4. existing values are only filled when empty, never overwritten with Samsara's.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const FILE = resolve(ROOT, "apps/backend/src/integrations/samsara/samsara-master-sync.service.ts");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

export function check(raw) {
  const src = stripComments(raw);
  const p = [];
  if (/INSERT INTO mdata\.(drivers|units|equipment)/.test(src)) p.push("the master sync creates driver/unit/equipment rows again.");
  const veh = src.slice(src.indexOf("export async function syncSamsaraVehiclesMaster("), src.indexOf("type MdataEquipmentType"));
  if (/mdata\.equipment/.test(veh)) p.push("the vehicle pass writes mdata.equipment again.");
  if ((src.match(/await takeSyncLock\(client, operatingCompanyId, "(drivers|vehicles|trailers)"\)/g) ?? []).length !== 3) p.push("a pass no longer takes the per-company advisory lock.");
  if (/SET (first_name|last_name) = \$/.test(src) || /phone = \$\d+,/.test(src)) p.push("Samsara values overwrite existing driver identity fields.");
  return p;
}

function selftest() {
  const g = readFileSync(FILE, "utf8");
  const cases = [
    [g, false],
    [g + "\nconst x = `INSERT INTO mdata.units (unit_number) VALUES ('x')`;", true],
    [g.replace('await takeSyncLock(client, operatingCompanyId, "trailers")', "true"), true],
  ];
  return cases.every(([s, f]) => (check(s).length > 0) === f);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--selftest")) {
    const ok = selftest();
    console.log(`verify-samsara-master-sync-link-only selftest ${ok ? "PASS" : "FAIL"}`);
    process.exit(ok ? 0 : 1);
  }
  const p = check(readFileSync(FILE, "utf8"));
  console.log(p.length ? `verify-samsara-master-sync-link-only FAILED:\n  - ${p.join("\n  - ")}` : "verify-samsara-master-sync-link-only: OK -- link-only, no creates, one runner, fill-empty only.");
  process.exit(p.length ? 1 : 0);
}
