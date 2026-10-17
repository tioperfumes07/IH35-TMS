#!/usr/bin/env node
/**
 * LEAD 443.184 (Lead 05:05Z — the G11 reported item): a stop event's load status (arrival → at_pickup / at_delivery,
 * departure → in_transit / delivered_pending_docs) is written ONLY by the load-status module
 * (dispatch/load-transition.service.ts writeLoadStatusFromStopEventInClientTx: same transitions, compare-and-set, audit
 * row). Measured on main before this step: the driver app (driver/loads.routes.ts ×2) and the office / Truck Line stamp
 * (dispatch/stop-stamp.service.ts ×2) each issued their own `UPDATE mdata.loads SET status`.
 * --selftest plants each regression.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const F = {
  module: "apps/backend/src/dispatch/load-transition.service.ts",
  stamp: "apps/backend/src/dispatch/stop-stamp.service.ts",
  driver: "apps/backend/src/driver/loads.routes.ts",
};
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");
const RAW = /UPDATE\s+mdata\.loads\s+SET\s+status\s*=/;

export function check(src = {}) {
  const s = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, src[k] ?? read(rel)]));
  const p = [];
  const w = s.module.match(/export async function writeLoadStatusFromStopEventInClientTx\([\s\S]*?\n\}/)?.[0] ?? "";
  if (!w || !/validateLoadStopStatusWrite\(input\.fromMdataStatus, input\.toMdataStatus\)/.test(w) || !/AND status::text = \$4/.test(w) || !/"dispatch\.load\.status_from_stop_event"/.test(w))
    p.push(`${F.module}: writeLoadStatusFromStopEventInClientTx must validate, compare-and-set and audit`);
  for (const k of ["stamp", "driver"]) {
    if (RAW.test(s[k])) p.push(`${F[k]}: writes mdata.loads.status itself — use writeLoadStatusFromStopEventInClientTx`);
    if ((s[k].match(/await writeLoadStatusFromStopEventInClientTx\(client as never, \{/g) ?? []).length !== 2)
      p.push(`${F[k]}: both the arrival and the departure must write the status through the status module`);
  }
  return p;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain && process.argv.includes("--selftest")) {
  const base = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, read(rel)]));
  if (check().length) {
    console.error("SELFTEST FAIL: baseline not clean", check());
    process.exit(1);
  }
  const plants = [
    ["raw UPDATE back in the stamp", { stamp: base.stamp + "\nconst x = `UPDATE mdata.loads SET status = $2 WHERE id = $1`;\n" }],
    ["driver arrival off the module", { driver: base.driver.replace("await writeLoadStatusFromStopEventInClientTx(client as never, {", "await somethingElse(client as never, {") }],
    ["writer stops auditing", { module: base.module.replace('"dispatch.load.status_from_stop_event"', '"x"') }],
  ];
  for (const [n, src] of plants) {
    if (!check(src).length) {
      console.error(`SELFTEST FAIL: plant "${n}" not caught`);
      process.exit(1);
    }
  }
  console.log(`SELFTEST PASS: ${plants.length} plants caught`);
  process.exit(0);
}
if (isMain) {
  const p = check();
  if (p.length) {
    console.error(`verify-load-status-written-only-by-status-module FAIL (${p.length}):`);
    for (const x of p) console.error(`  ${x}`);
    process.exit(1);
  }
  console.log("verify-load-status-written-only-by-status-module PASS: stop events write the load status through load-transition.service (audited)");
}
