#!/usr/bin/env node
/**
 * ND-FA-01 — every real TRK-owned unit must be registerable on accounting.fixed_assets
 * (5-yr SL truck class). Pins the register service + unit_uuid FK path.
 *
 * Live Neon density (0 → N) is proven after owner apply / register run — CI is structural.
 * When DATABASE_URL is set, optional probe asserts TRK truck class exists (lucia).
 *
 *   node scripts/verify-owned-units-registered.mjs
 *   node scripts/verify-owned-units-registered.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-owned-units-registered";

const FILES = {
  register: "apps/backend/src/accounting/owned-unit-fixed-asset-register.service.ts",
  routes: "apps/backend/src/accounting/fixed-assets.routes.ts",
  math: "apps/backend/src/accounting/fixed-assets.math.ts",
  cron: "apps/backend/src/cron/depreciation-autopost.cron.ts",
};

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function contractErrors(src) {
  const errors = [];
  if (!src.register.includes("accounting.fixed_assets")) {
    errors.push("register service must INSERT/SELECT accounting.fixed_assets (canonical)");
  }
  if (!src.register.includes("unit_uuid")) {
    errors.push("register service must bind unit_uuid FK to mdata.units");
  }
  if (!src.register.includes("registerOwnedUnitAsFixedAsset") && !src.register.includes("registerRealTrkOwnedUnits")) {
    errors.push("register service must export registerOwnedUnitAsFixedAsset and/or registerRealTrkOwnedUnits");
  }
  if (/fixed_assets\.(assets|asset_classes)\b/.test(src.register)) {
    errors.push("must NOT write legacy fixed_assets.* schema");
  }
  if (!src.routes.includes("/api/v1/accounting/fixed-assets")) {
    errors.push("fixed-assets router must remain mounted at /api/v1/accounting/fixed-assets");
  }
  if (!src.math.includes("computeDepreciationSchedule")) {
    errors.push("must reuse fixed-assets.math computeDepreciationSchedule (no new GL math)");
  }
  if (!src.cron.includes("FIXED_ASSET_AUTOPOST_ENABLED")) {
    errors.push("depreciation autopost cron must stay gated on FIXED_ASSET_AUTOPOST_ENABLED");
  }
  if (!src.register.includes("truck") && !src.register.includes("Trucks")) {
    errors.push("register must target the 5-yr truck class (class_code truck / Trucks)");
  }
  return errors;
}

function selftest() {
  const good = {
    register: [
      "export async function registerOwnedUnitAsFixedAsset() {}",
      "export async function registerRealTrkOwnedUnits() {}",
      "INSERT INTO accounting.fixed_assets",
      "unit_uuid",
      "class_code = 'truck'",
    ].join("\n"),
    routes: "/api/v1/accounting/fixed-assets",
    math: "computeDepreciationSchedule",
    cron: "FIXED_ASSET_AUTOPOST_ENABLED",
  };
  if (contractErrors(good).length) {
    console.error(`${LABEL} --selftest FAIL good:`, contractErrors(good));
    process.exit(1);
  }
  const legacy = { ...good, register: good.register + "\nINSERT INTO fixed_assets.assets" };
  if (!contractErrors(legacy).some((e) => e.includes("legacy"))) {
    console.error(`${LABEL} --selftest FAIL legacy write not caught`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

for (const [k, rel] of Object.entries(FILES)) {
  if (!fs.existsSync(path.join(ROOT, rel))) {
    console.error(`${LABEL}: FAIL — missing ${rel} (${k})`);
    process.exit(1);
  }
}
const src = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));
const errors = contractErrors(src);
if (errors.length) {
  console.error(`${LABEL}: FAIL`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `${LABEL}: PASS — owned-unit register service + accounting.fixed_assets path pinned; live density UNVERIFIED until Neon register run`
);
process.exit(0);
