#!/usr/bin/env node
/**
 * LST-F5009 / LST-PICKER-01 — RELEASED vendor_type CHECK relax must stay in lockstep with the
 * catalog-backed writer (R=W). Locks out:
 *   (a) deleting the migration
 *   (b) reverting ADD CONSTRAINT to the closed 8-value ARRAY
 *   (c) re-registering the file in held[] (would skip prod migrate / re-hold)
 *   (d) re-narrowing the backend write schema to a frozen allow-list
 *   (e) dropping DO NOT RUN / APPLIED ON PROD markers (applied_held registry parity)
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
    problems.push(`${MIGRATION_REL} is missing — DB companion to catalog-backed vendor_type R=W was removed`);
    return problems;
  }

  if (!/DO NOT RUN ON PROD/i.test(src.slice(0, 1600))) {
    problems.push(
      `${MIGRATION_REL} lost its "DO NOT RUN ON PROD" marker — applied_held files keep the marker so ` +
        `verify-hold-migrations-registered stays green (prod skip = registry + ledger)`,
    );
  }
  if (!/APPLIED ON PROD/i.test(src.slice(0, 1600))) {
    problems.push(`${MIGRATION_REL} header must say APPLIED ON PROD after Cursor Neon-apply (LST-F5009)`);
  }
  if (!/DROP CONSTRAINT IF EXISTS\s+vendors_vendor_type_check/i.test(src)) {
    problems.push(`${MIGRATION_REL} no longer DROPs vendors_vendor_type_check idempotently`);
  }
  if (!/ADD CONSTRAINT\s+vendors_vendor_type_check/i.test(src)) {
    problems.push(`${MIGRATION_REL} no longer ADDs a replacement vendors_vendor_type_check constraint`);
  }
  const addBlockMatch = src.match(/ADD CONSTRAINT\s+vendors_vendor_type_check[\s\S]{0,400}?;/i);
  const addBlock = addBlockMatch ? addBlockMatch[0] : "";
  const legacyHits = LEGACY_VALUES.filter((v) => new RegExp(`'${v}'`, "i").test(addBlock));
  if (legacyHits.length >= 4) {
    problems.push(
      `${MIGRATION_REL} ADD CONSTRAINT block still enumerates the closed legacy list (${legacyHits.join(", ")})`,
    );
  }
  if (!/length\s*\(\s*vendor_type\s*\)\s*<=\s*100/i.test(addBlock)) {
    problems.push(`${MIGRATION_REL} CHECK no longer bounds length(vendor_type) <= 100`);
  }
  if (!/length\s*\(\s*btrim\s*\(\s*vendor_type\s*\)\s*\)\s*>\s*0/i.test(addBlock)) {
    problems.push(`${MIGRATION_REL} CHECK no longer rejects blank vendor_type`);
  }
  return problems;
}

function checkRegistry(read) {
  const problems = [];
  let registry;
  try {
    registry = JSON.parse(read(REGISTRY_REL));
  } catch {
    problems.push(`${REGISTRY_REL} missing or invalid JSON`);
    return problems;
  }
  const fileName = MIGRATION_REL.split("/").pop();
  const held = Array.isArray(registry.held) ? registry.held : [];
  if (held.some((e) => e?.file === fileName)) {
    problems.push(`${fileName} is still in held[] — RELEASED/applied; move to applied_held[] with applied_on_prod:true`);
  }
  const applied = Array.isArray(registry.applied_held) ? registry.applied_held : [];
  const found = applied.find((e) => e?.file === fileName);
  if (!found) {
    problems.push(`${fileName} missing from applied_held[] after release`);
  } else if (found.applied_on_prod !== true) {
    problems.push(`${fileName} in applied_held[] but applied_on_prod !== true`);
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
  const widened =
    /vendorTypeSchema\s*=\s*z\.string\(\)\.trim\(\)\.min\(1\)\.max\(100\)/.test(src) ||
    /vendorTypeWriteSchema\s*=\s*z\.string\(\)\.trim\(\)\.min\(1\)\.max\(100\)/.test(src);
  if (!widened) {
    problems.push(
      `${BACKEND_ROUTES_REL} must use catalog-backed z.string().trim().min(1).max(100) for vendor_type writes (R=W)`,
    );
  }
  if (
    /export const VENDOR_TYPE_VALUES\s*=\s*\["Fuel"/.test(src) &&
    /canonicalVendorType/.test(src) &&
    /must be one of:/.test(src)
  ) {
    problems.push(
      `${BACKEND_ROUTES_REL} still rejects catalog types via frozen VENDOR_TYPE_VALUES allow-list — reopen R≠W`,
    );
  }
  const enumMatch = src.match(/vendorTypeSchema\s*=\s*z\.enum\(\s*\[[\s\S]{0,300}?\]\s*\)/);
  if (enumMatch) {
    problems.push(`${BACKEND_ROUTES_REL} vendorTypeSchema reverted to frozen z.enum([...])`);
  }
  return problems;
}

function selftest() {
  const goodMig =
    "-- [APPLIED ON PROD 2026-08-13 — LST-F5009] DO NOT RUN ON PROD\nBEGIN;\n" +
    "ALTER TABLE mdata.vendors DROP CONSTRAINT IF EXISTS vendors_vendor_type_check;\n" +
    "ALTER TABLE mdata.vendors ADD CONSTRAINT vendors_vendor_type_check\n" +
    "  CHECK (vendor_type IS NOT NULL AND length(btrim(vendor_type)) > 0 AND length(vendor_type) <= 100);\n" +
    "COMMIT;\n";
  const fakeFiles = {
    good: {
      [MIGRATION_REL]: goodMig,
      [REGISTRY_REL]: JSON.stringify({
        held: [],
        applied_held: [{ file: "202611021200_vendors_vendor_type_check_relax.sql", applied_on_prod: true }],
      }),
      [BACKEND_ROUTES_REL]: "const vendorTypeSchema = z.string().trim().min(1).max(100);\n",
    },
  };

  const cases = [
    { name: "applied migration+registry+schema passes", files: fakeFiles.good, expect: 0 },
    {
      name: "missing DO-NOT-RUN marker caught",
      files: {
        ...fakeFiles.good,
        [MIGRATION_REL]: goodMig.replace("DO NOT RUN ON PROD", "already applied"),
      },
      expect: 1,
    },
    {
      name: "missing APPLIED ON PROD caught",
      files: {
        ...fakeFiles.good,
        [MIGRATION_REL]: goodMig.replace("APPLIED ON PROD", "PENDING"),
      },
      expect: 1,
    },
    {
      name: "reverted to frozen 8-value ARRAY caught",
      files: {
        ...fakeFiles.good,
        [MIGRATION_REL]:
          "-- [APPLIED ON PROD] DO NOT RUN ON PROD\nBEGIN;\n" +
          "ALTER TABLE mdata.vendors DROP CONSTRAINT IF EXISTS vendors_vendor_type_check;\n" +
          "ALTER TABLE mdata.vendors ADD CONSTRAINT vendors_vendor_type_check CHECK (vendor_type = ANY (ARRAY['Fuel','Repair','Tires','Towing','Insurance','Permit','Toll','Other']));\nCOMMIT;\n",
      },
      expect: 3,
    },
    {
      name: "still in held[] caught",
      files: {
        ...fakeFiles.good,
        [REGISTRY_REL]: JSON.stringify({
          held: [{ file: "202611021200_vendors_vendor_type_check_relax.sql" }],
          applied_held: [],
        }),
      },
      expect: 2,
    },
    {
      name: "backend re-narrowed to enum caught",
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
  console.log(
    "verify-vendor-type-check-relaxed OK — RELEASED length CHECK + applied_held + catalog-backed writer stay in lockstep",
  );
}

main();
