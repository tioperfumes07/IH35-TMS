#!/usr/bin/env node
/**
 * LST-PICKER-01 (vendor_type CHECK slice) — the HELD companion migration to PR #3884 (guard 1852)
 * must keep three things in lockstep, or a future edit silently reopens the DB-vs-Zod mismatch:
 *
 * THE DEFECT THIS LOCKS OUT: PR #3884 widened the app-layer Zod schema for
 * mdata.vendors.vendor_type from a frozen 8-value z.enum to z.string().trim().min(1).max(100), so
 * VendorDetail.tsx can save any catalogs.vendor_types-sourced value. Neon PROD's
 * vendors_vendor_type_check CHECK still enforced the closed 8-value ARRAY, so a catalog-created
 * vendor type would 400/500 at the DB layer even though the app layer now accepts it —
 * a Zod widening with no matching DB migration is theater (Rule 23). The companion HELD migration
 * 202611021200_vendors_vendor_type_check_relax.sql fixes this at the DB layer. A well-meaning
 * "simplify" edit could (a) delete the migration, (b) revert its CHECK to the old 8-value ARRAY,
 * (c) drop its registration in .held-migrations.json (which would let it silently fire on the next
 * prod deploy instead of staying owner-gated), or (d) re-narrow apps/backend's vendorTypeSchema
 * back to a frozen enum while the DB stays widened. This guard fails on any of the four.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MIGRATION_REL = "db/migrations/202611021200_vendors_vendor_type_check_relax.sql";
const REGISTRY_REL = "db/migrations/.held-migrations.json";
const BACKEND_ROUTES_REL = "apps/backend/src/mdata/vendors.routes.ts";

const LEGACY_VALUES = ["Fuel", "Repair", "Tires", "Towing", "Insurance", "Permit", "Toll", "Other"];

function checkMigrationFile(read) {
  const problems = [];
  let src;
  try {
    src = read(MIGRATION_REL);
  } catch {
    problems.push(`${MIGRATION_REL} is missing — the DB-layer companion to PR #3884's Zod widening was removed`);
    return problems;
  }

  if (!/DO NOT RUN ON PROD/i.test(src.slice(0, 1200))) {
    problems.push(`${MIGRATION_REL} lost its "DO NOT RUN ON PROD" marker — it would fire unattended on the next prod deploy`);
  }
  if (!/DROP CONSTRAINT IF EXISTS\s+vendors_vendor_type_check/i.test(src)) {
    problems.push(`${MIGRATION_REL} no longer DROPs vendors_vendor_type_check idempotently (DROP CONSTRAINT IF EXISTS required)`);
  }
  if (!/ADD CONSTRAINT\s+vendors_vendor_type_check/i.test(src)) {
    problems.push(`${MIGRATION_REL} no longer ADDs a replacement vendors_vendor_type_check constraint`);
  }
  // The new CHECK body must not reintroduce the closed 8-value list (that would be a silent revert).
  const addBlockMatch = src.match(/ADD CONSTRAINT\s+vendors_vendor_type_check[\s\S]{0,400}?;/i);
  const addBlock = addBlockMatch ? addBlockMatch[0] : "";
  const legacyHits = LEGACY_VALUES.filter((v) => new RegExp(`'${v}'`, "i").test(addBlock));
  if (legacyHits.length >= 4) {
    problems.push(
      `${MIGRATION_REL} ADD CONSTRAINT block still enumerates the closed legacy list (${legacyHits.join(", ")}) — ` +
        `the widening was reverted back to a frozen ARRAY`
    );
  }
  if (!/length\s*\(\s*vendor_type\s*\)\s*<=\s*100/i.test(addBlock)) {
    problems.push(`${MIGRATION_REL} CHECK no longer bounds length(vendor_type) <= 100 — must match Zod .max(100)`);
  }
  if (!/length\s*\(\s*btrim\s*\(\s*vendor_type\s*\)\s*\)\s*>\s*0/i.test(addBlock)) {
    problems.push(`${MIGRATION_REL} CHECK no longer rejects blank vendor_type — must match Zod .trim().min(1)`);
  }
  return problems;
}

function checkRegistry(read) {
  const problems = [];
  let raw;
  try {
    raw = read(REGISTRY_REL);
  } catch {
    problems.push(`${REGISTRY_REL} is missing`);
    return problems;
  }
  let registry;
  try {
    registry = JSON.parse(raw);
  } catch {
    problems.push(`${REGISTRY_REL} is not valid JSON`);
    return problems;
  }
  const fileName = MIGRATION_REL.split("/").pop();
  const allEntries = Object.values(registry).filter(Array.isArray).flat();
  const found = allEntries.find((e) => e && e.file === fileName);
  if (!found) {
    problems.push(`${fileName} is not registered in ${REGISTRY_REL} — a HELD migration must be tracked so it can't silently fire on prod`);
  }
  return problems;
}

function checkBackendSchema(read) {
  const problems = [];
  let src;
  try {
    src = read(BACKEND_ROUTES_REL);
  } catch {
    problems.push(`${BACKEND_ROUTES_REL} is missing`);
    return problems;
  }
  const narrowed = /export const VENDOR_TYPE_VALUES\s*=\s*\["Fuel",\s*"Repair",\s*"Tires",\s*"Towing",\s*"Insurance",\s*"Permit",\s*"Toll",\s*"Other"\]/.test(src) &&
    /const vendorTypeWriteSchema\s*=\s*z[\s\S]{0,500}?canonicalVendorType/.test(src);
  const widened = /vendorTypeSchema\s*=\s*z\.string\(\)\.trim\(\)\.min\(1\)\.max\(100\)/.test(src);
  if (!narrowed && !widened) {
    problems.push(
      `${BACKEND_ROUTES_REL} must either validate the live 8-value DB CHECK with case normalization, ` +
        `or use the widened string schema when the held migration is released`
    );
  }
  const enumMatch = src.match(/vendorTypeSchema\s*=\s*z\.enum\(\s*\[[\s\S]{0,300}?\]\s*\)/);
  if (enumMatch) {
    problems.push(`${BACKEND_ROUTES_REL} vendorTypeSchema reverted to a frozen z.enum([...]) — the legacy 8-value union is back`);
  }
  return problems;
}

function selftest() {
  const fakeFiles = {
    good: {
      [MIGRATION_REL]:
        "-- [HOLD-FOR-JORGE] DO NOT RUN ON PROD.\n" +
        "BEGIN;\n" +
        "ALTER TABLE mdata.vendors DROP CONSTRAINT IF EXISTS vendors_vendor_type_check;\n" +
        "ALTER TABLE mdata.vendors ADD CONSTRAINT vendors_vendor_type_check\n" +
        "  CHECK (vendor_type IS NOT NULL AND length(btrim(vendor_type)) > 0 AND length(vendor_type) <= 100);\n" +
        "COMMIT;\n",
      [REGISTRY_REL]: JSON.stringify({ held: [{ file: "202611021200_vendors_vendor_type_check_relax.sql" }] }),
      [BACKEND_ROUTES_REL]: "const vendorTypeSchema = z.string().trim().min(1).max(100);\n",
    },
  };

  const cases = [
    { name: "well-formed migration+registry+schema passes", files: fakeFiles.good, expect: 0 },
    {
      name: "missing DO-NOT-RUN marker caught",
      files: { ...fakeFiles.good, [MIGRATION_REL]: fakeFiles.good[MIGRATION_REL].replace("DO NOT RUN ON PROD", "just a migration") },
      expect: 1,
    },
    {
      name: "reverted to frozen 8-value ARRAY caught",
      files: {
        ...fakeFiles.good,
        [MIGRATION_REL]:
          "-- DO NOT RUN ON PROD.\nBEGIN;\n" +
          "ALTER TABLE mdata.vendors DROP CONSTRAINT IF EXISTS vendors_vendor_type_check;\n" +
          "ALTER TABLE mdata.vendors ADD CONSTRAINT vendors_vendor_type_check CHECK (vendor_type = ANY (ARRAY['Fuel','Repair','Tires','Towing','Insurance','Permit','Toll','Other']));\nCOMMIT;\n",
      },
      // Reverting to the closed ARRAY also removes the length/blank bounds — all three checks fire.
      expect: 3,
    },
    {
      name: "unregistered from held-migrations.json caught",
      files: { ...fakeFiles.good, [REGISTRY_REL]: JSON.stringify({ held: [] }) },
      expect: 1,
    },
    {
      name: "backend schema re-narrowed to enum caught",
      files: {
        ...fakeFiles.good,
        [BACKEND_ROUTES_REL]:
          "const vendorTypeSchema = z.enum(['Fuel','Repair','Tires','Towing','Insurance','Permit','Toll','Other']);\n",
      },
      expect: 2,
    },
    {
      name: "migration file deleted caught",
      files: { [REGISTRY_REL]: fakeFiles.good[REGISTRY_REL], [BACKEND_ROUTES_REL]: fakeFiles.good[BACKEND_ROUTES_REL] },
      expect: 1,
    },
  ];

  let bad = 0;
  for (const c of cases) {
    const read = (rel) => {
      if (!(rel in c.files)) throw new Error("ENOENT");
      return c.files[rel];
    };
    const got = [...checkMigrationFile(read), ...checkRegistry(read), ...checkBackendSchema(read)];
    if (got.length !== c.expect) {
      console.error(`  selftest FAIL — ${c.name}: expected ${c.expect}, got ${got.length}`);
      for (const p of got) console.error(`      - ${p}`);
      bad += 1;
    } else {
      console.log(`  selftest OK — ${c.name}`);
    }
  }
  if (bad) {
    console.error(`verify-vendor-type-check-relaxed SELFTEST FAIL — ${bad}/${cases.length}`);
    process.exit(1);
  }
  console.log(`verify-vendor-type-check-relaxed SELFTEST OK — ${cases.length}/${cases.length}`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();

  const read = (rel) => {
    const fp = join(ROOT, rel);
    if (!existsSync(fp)) throw new Error("ENOENT");
    return readFileSync(fp, "utf8");
  };

  const problems = [...checkMigrationFile(read), ...checkRegistry(read), ...checkBackendSchema(read)];

  if (problems.length) {
    console.error("verify-vendor-type-check-relaxed FAIL:\n");
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log("verify-vendor-type-check-relaxed OK — held widening remains registered and backend rejects values the live DB CHECK rejects");
}

main();
