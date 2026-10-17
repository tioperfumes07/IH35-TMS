#!/usr/bin/env node
/**
 * LEAD 443.192 (verify-driver-bill-has-miles-and-rate, 2 new bills): a merged-away driver record is never a load's driver,
 * and a bill linked to a voided / cancelled settlement is settled in nothing.
 * Measured on main before this step: loads 13656 / 13680 were booked 2026-10-16 on merged record 5363ee51 through an Owner
 * credential override — assertDriverQualifiedForLoad (dispatch/driver-qualification.service.ts) never read
 * merged_into_driver_id — so the pay writer priced the merged record (no rate card) and minted two $0, rate-NULL bills.
 * book-load.service.ts also read settled_in_settlement_id raw, so a link to a CANCELLED settlement counted as settled and
 * blocked the engine re-price / reassignment.
 * --selftest plants each regression.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const F = {
  gate: "apps/backend/src/dispatch/driver-qualification.service.ts",
  book: "apps/backend/src/dispatch/book-load.service.ts",
};
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");

export function check(src = {}) {
  const s = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, src[k] ?? read(rel)]));
  const p = [];
  const gate = s.gate.match(/export async function assertDriverQualifiedForLoad\([\s\S]*?\n\}/)?.[0] ?? "";
  if (!/d\.merged_into_driver_id::text AS merged_into/.test(gate))
    p.push(`${F.gate}: assertDriverQualifiedForLoad must read mdata.drivers.merged_into_driver_id`);
  if (!/if \(dr\.merged_into\) throw new DriverMergedError\(/.test(gate))
    p.push(`${F.gate}: a merged record must be THROWN (DriverMergedError) — a returned block is overridable`);
  if (!/class DriverMergedError extends DriverNotQualifiedError/.test(s.gate))
    p.push(`${F.gate}: DriverMergedError must subclass DriverNotQualifiedError (every route renders it as a 422)`);
  if (!/"historical_import_driver_merged"/.test(s.book))
    p.push(`${F.book}: the historical-import path (skips the shared gate) must refuse a merged driver record`);
  if (!/s\.voided_at IS NULL AND s\.status <> 'cancelled'\) AS settlement_live/.test(s.book) ||
      !/CASE WHEN settlement_live THEN settled_in_settlement_id::text END AS settled_in_settlement_id/.test(s.book))
    p.push(`${F.book}: an existing bill counts as settled only in a LIVE settlement (voided / cancelled = settled in nothing)`);
  if ((s.book.match(/await auditDeadSettlementLinkReleased\(client, input, existing, String\(load\.id\)\)/g) ?? []).length !== 2)
    p.push(`${F.book}: both the re-price and the reassignment must audit a released dead settlement link`);
  return p;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain && process.argv.includes("--selftest")) {
  const base = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, read(rel)]));
  if (check(base).length) {
    console.error("SELFTEST FAIL: baseline not clean", check(base));
    process.exit(1);
  }
  const plants = [
    ["gate stops reading the merge", { gate: base.gate.replace("d.merged_into_driver_id::text AS merged_into", "NULL::text AS merged_into") }],
    ["merged record returned as an overridable block", { gate: base.gate.replace("if (dr.merged_into) throw new DriverMergedError(", "if (dr.merged_into) void (") }],
    ["historical import accepts a merged record", { book: base.book.replace('"historical_import_driver_merged"', '"x"') }],
    ["cancelled settlement counts as settled", { book: base.book.replace("AND s.status <> 'cancelled') AS settlement_live", ") AS settlement_live") }],
    ["release not audited", { book: base.book.replace("await auditDeadSettlementLinkReleased(client, input, existing, String(load.id));", "") }],
  ];
  for (const [n, src] of plants) {
    const k = Object.keys(src)[0];
    if (src[k] === base[k]) {
      console.error(`SELFTEST FAIL: plant "${n}" did not apply`);
      process.exit(1);
    }
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
    console.error(`verify-merged-driver-never-load-driver: FAIL —\n  ${p.join("\n  ")}`);
    process.exit(1);
  }
  console.log("verify-merged-driver-never-load-driver: OK — merged records refused as load drivers; dead settlement links released, audited.");
}
