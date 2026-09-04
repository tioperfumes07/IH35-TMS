#!/usr/bin/env node
/**
 * INSURED-ASSET-RECONCILIATION-2026-08-31 — mdata.assets (the table insurance.policy_unit.asset_id
 * resolves through, per resolve-asset-id.shared.ts) held 90 rows, 100% asset_type='tractor', zero
 * trailer rows, live-verified. mdata.equipment (trailers) had no counterpart in mdata.assets at all
 * and no code path ever wrote one — the $343,495 of insured trailer value had no reachable home.
 * Guard: equipment create mints/relinks its mdata.assets row the same way unit create does
 * (ensureUnitAsset / FAIL-INS-POLICY-ASSET-404), via ensureEquipmentAsset, using one of the
 * asset registry's actual trailer subtypes rather than its forbidden generic `trailer` literal.
 *
 *   node scripts/verify-insurance-equipment-asset-bridge.mjs
 *   node scripts/verify-insurance-equipment-asset-bridge.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-insurance-equipment-asset-bridge";

const SHARED = "apps/backend/src/mdata/ensure-equipment-asset.shared.ts";
const ROUTES = "apps/backend/src/mdata/equipment.routes.ts";

function read(rel) {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

export function assertGuard({ shared, routes }) {
  const errs = [];

  if (!shared?.includes("export async function ensureEquipmentAsset")) {
    errs.push(`${SHARED}: must export ensureEquipmentAsset`);
  }
  if (!shared?.includes("assetTypeForEquipmentType")) {
    errs.push(`${SHARED}: must map equipment_type to a canonical mdata.assets asset_type`);
  }
  for (const canonicalType of ['"dry_van"', '"reefer"', '"flatbed"', '"other"']) {
    if (!shared?.includes(canonicalType)) {
      errs.push(`${SHARED}: canonical equipment mapping must include ${canonicalType}`);
    }
  }
  if (shared?.match(/VALUES\s*\([^)]*['"]trailer['"]/s)) {
    errs.push(`${SHARED}: must not INSERT generic asset_type='trailer' — the database CHECK forbids it`);
  }
  if (!shared?.includes("ON CONFLICT (tenant_id, unit_code)")) {
    errs.push(`${SHARED}: must be idempotent on the same natural key ensureUnitAsset uses`);
  }
  if (!shared?.includes("equipment_id")) {
    errs.push(`${SHARED}: must write mdata.assets.equipment_id so the resolver can bridge trailers`);
  }
  // Deliberately NOT set: insured_value_cents must stay NULL on mint, never defaulted to 0 — a
  // fabricated $0 insured value is worse than an honest gap (matches ensureUnitAsset's own rule).
  // Checked against the actual INSERT's column list, not the whole file, so this file's own
  // explanatory prose mentioning the column by name doesn't false-positive the guard.
  const insertCols = /INSERT INTO mdata\.assets\s*\(([^)]*)\)/.exec(shared ?? "")?.[1] ?? "";
  if (insertCols.includes("insured_value_cents")) {
    errs.push(`${SHARED}: must NOT set insured_value_cents on mint — leave NULL, the owner supplies real values`);
  }

  if (!routes?.includes('from "./ensure-equipment-asset.shared.js"')) {
    errs.push(`${ROUTES}: equipment create must import ensureEquipmentAsset from the shared module`);
  }
  if (!routes?.includes("ensureEquipmentAsset(")) {
    errs.push(`${ROUTES}: equipment create must call ensureEquipmentAsset so every new trailer is insurable`);
  }
  if (routes?.includes("ensureEquipmentAsset(") && !routes.includes("tenantId: effectiveCompanyId")) {
    errs.push(`${ROUTES}: the asset must belong to the same lessee-resolved company the equipment row was scoped under`);
  }
  if (routes?.includes("ensureEquipmentAsset(") && !routes.includes("equipmentType: String(row.equipment_type)")) {
    errs.push(`${ROUTES}: equipment create must pass its canonical equipment_type into the asset bridge`);
  }

  return errs;
}

function selftest() {
  const goodShared = `
    export function assetTypeForEquipmentType(value) {
      if (value === "DryVan") return "dry_van";
      if (value === "Reefer") return "reefer";
      if (value === "Flatbed") return "flatbed";
      return "other";
    }
    export async function ensureEquipmentAsset
    INSERT INTO mdata.assets (tenant_id, unit_code, asset_type, vin, make, model, year, status, equipment_id)
    VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, 'active', $8::uuid)
    ON CONFLICT (tenant_id, unit_code) DO UPDATE SET
    equipment_id = EXCLUDED.equipment_id
  `;
  const goodRoutes = `
    import { ensureEquipmentAsset } from "./ensure-equipment-asset.shared.js";
    await ensureEquipmentAsset(client, { tenantId: effectiveCompanyId, equipmentId: String(row.id), equipmentType: String(row.equipment_type) });
  `;
  const good = assertGuard({ shared: goodShared, routes: goodRoutes });
  if (good.length) {
    console.error(`${LABEL} --selftest FAIL good (${good.length}): ${good.join("; ")}`);
    process.exit(1);
  }

  // Mutation 1: no export at all.
  const bad1 = assertGuard({ shared: "// nothing here", routes: goodRoutes });
  // Mutation 2: collapses a canonical subtype to generic trailer, which the DB CHECK forbids.
  const bad2 = assertGuard({ shared: goodShared.replace("VALUES ($1::uuid, $2, $3", "VALUES ($1::uuid, $2, 'trailer'"), routes: goodRoutes });
  // Mutation 3: no ON CONFLICT — not idempotent, a retry would throw or duplicate.
  const bad3 = assertGuard({ shared: goodShared.replace("ON CONFLICT (tenant_id, unit_code) DO UPDATE SET", ""), routes: goodRoutes });
  // Mutation 4: defaults insured_value_cents to 0 on mint (fabricates a valued-at-nothing asset).
  const bad4 = assertGuard({
    shared: goodShared.replace(
      "INSERT INTO mdata.assets (tenant_id, unit_code, asset_type, vin, make, model, year, status, equipment_id)",
      "INSERT INTO mdata.assets (tenant_id, unit_code, asset_type, insured_value_cents, vin, make, model, year, status, equipment_id)"
    ),
    routes: goodRoutes,
  });
  // Mutation 5: route never calls it.
  const bad5 = assertGuard({ shared: goodShared, routes: "// no call" });
  // Mutation 6: route calls it under the wrong tenant (owner instead of lessee).
  const bad6 = assertGuard({ shared: goodShared, routes: goodRoutes.replace("effectiveCompanyId", "resolvedOwnerId") });
  // Mutation 7: route omits the equipment type, so the bridge cannot preserve the subtype.
  const bad7 = assertGuard({ shared: goodShared, routes: goodRoutes.replace(", equipmentType: String(row.equipment_type)", "") });

  for (const [name, res] of [
    ["bad1-no-export", bad1],
    ["bad2-wrong-asset-type", bad2],
    ["bad3-not-idempotent", bad3],
    ["bad4-fabricated-value", bad4],
    ["bad5-never-called", bad5],
    ["bad6-wrong-tenant", bad6],
    ["bad7-type-not-forwarded", bad7],
  ]) {
    if (res.length === 0) {
      console.error(`${LABEL} --selftest FAIL ${name}: mutation not caught`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS 7/7 mutations caught`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const shared = read(SHARED);
const routes = read(ROUTES);
if (shared == null || routes == null) {
  console.error(`[${LABEL}] FAILED — missing source file`);
  process.exit(1);
}
const errs = assertGuard({ shared, routes });
if (errs.length) {
  console.error(`[${LABEL}] FAILED — ${errs.length} issue(s):`);
  for (const e of errs) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — equipment create mints its subtype-correct mdata.assets counterpart`);
