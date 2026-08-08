#!/usr/bin/env node
/**
 * GUARD — LV-TXN-017. The app-layer vendor_type contract must match the DATABASE's CHECK constraint.
 *
 * THE DEFECT: `vendors.routes.ts` validated vendor_type as `z.string().trim().min(1).max(100)` — ANY string
 * — while `mdata.vendors` carried
 *   CHECK (vendor_type = ANY (ARRAY['Fuel','Repair','Tires','Towing','Insurance','Permit','Toll','Other']))
 * PROD-VERIFIED 2026-08-08 on br-fancy-credit-akjnd07a via pg_constraint, convalidated = true. Anything
 * outside those 8 never got a 400; it reached Postgres and aborted as HTTP 500 / PG 23514. Because the
 * constraint is CASE-SENSITIVE, the most likely input of all — lowercase 'other' — 500'd, naming neither
 * the field, the legal values, nor the fact that only capitalisation was wrong. CC-3 proved it live on
 * USMCA: 'Other' -> 201, 'other' -> 500, 'NotAType123' -> 500.
 *
 * WHY A DRIFT GUARD AND NOT A VALUE CHECK: the bug is not that either list is wrong — each was defensible
 * on its own. The bug is that the two lists DISAGREED and nothing connected them. They live in different
 * files owned by different lanes (a route vs a migration), so they drift independently and silently, and
 * the drift only ever surfaces to a user as an opaque 500. This asserts the pair agrees.
 *
 * THE HELD MIGRATION: db/migrations/202611021200_vendors_vendor_type_check_relax.sql would replace the
 * 8-value CHECK with a length-only CHECK, which would make free-form types legal again. It is marked
 * HOLD-FOR-JORGE / "DO NOT RUN ON PROD" and is NOT applied. This guard deliberately keys off the CHECK that
 * is CURRENTLY authoritative (0008) and will go RED the moment someone applies the relax without widening
 * the route to match — which is exactly the drift it exists to catch, in the other direction.
 *
 * NOT CLAIMED: static text parity between a route file and a migration file. It does not connect to a live
 * database, so it cannot prove what prod enforces this minute — that was verified by hand on Neon and is
 * recorded above. It proves the two REPO-side contracts cannot silently diverge again.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-vendor-type-app-db-parity";
const ROUTE = "apps/backend/src/mdata/vendors.routes.ts";
const MIGRATION = "db/migrations/0008_mdata_init.sql";

/** The 8 values as the DB CHECK lists them, read from the migration rather than hardcoded here. */
export function dbCheckValues(migrationSrc) {
  const m = migrationSrc.match(/vendor_type\s+IN\s*\(([^)]*)\)/i);
  if (!m) return null;
  const values = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  return values.length ? values : null;
}

/** The app-layer allow-list, read from the exported VENDOR_TYPE_VALUES tuple. */
export function appValues(routeSrc) {
  const m = routeSrc.match(/VENDOR_TYPE_VALUES\s*=\s*\[([^\]]*)\]/);
  if (!m) return null;
  const values = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  return values.length ? values : null;
}

export function audit(routeSrc, migrationSrc) {
  const problems = [];

  const db = dbCheckValues(migrationSrc);
  if (!db) return [`${MIGRATION}: could not read the vendor_type CHECK list — refusing to pass vacuously.`];

  const app = appValues(routeSrc);
  if (!app) {
    return [
      `${ROUTE}: could not find VENDOR_TYPE_VALUES. The route must validate vendor_type against an ` +
        `explicit list that matches the DB CHECK (${db.join(", ")}); a bare z.string() lets an illegal ` +
        `value reach Postgres and surface as HTTP 500 / 23514 instead of a 400 (LV-TXN-017).`,
    ];
  }

  // Order-insensitive, value-exact. Either side gaining or losing a value is drift.
  const appSet = new Set(app);
  const dbSet = new Set(db);
  const onlyApp = app.filter((v) => !dbSet.has(v));
  const onlyDb = db.filter((v) => !appSet.has(v));

  if (onlyApp.length) {
    problems.push(
      `${ROUTE}: accepts ${onlyApp.map((v) => `"${v}"`).join(", ")}, which the DB CHECK in ${MIGRATION} ` +
        `does NOT allow. The API would return 201 and Postgres would abort with 23514 — a 500 the caller ` +
        `cannot act on.`,
    );
  }
  if (onlyDb.length) {
    problems.push(
      `${ROUTE}: rejects ${onlyDb.map((v) => `"${v}"`).join(", ")}, which the DB CHECK in ${MIGRATION} ` +
        `DOES allow. The API would 400 on a value the database would have accepted.`,
    );
  }

  // The 500 was only half the defect; the other half was that nothing normalised case against a
  // case-sensitive CHECK. Require the route to keep a case-insensitive path.
  //
  // SCOPED TO THE VENDOR-TYPE REGION, not the whole file. A file-wide /toLowerCase\(\)/ test passed
  // vacuously: vendors.routes.ts contains 4 unrelated toLowerCase() calls (the email transform among
  // them), so deleting the vendor-type normalisation still matched and the check exited 0. That is the
  // same false-green shape as LV-TXN-002's file-wide join assertion — a guard that cannot fail alone is
  // not a guard. Mutation-proven: removing ONLY the vendor-type toLowerCase now exits 1.
  const regionStart = routeSrc.indexOf("VENDOR_TYPE_VALUES");
  const afterList = regionStart === -1 ? "" : routeSrc.slice(regionStart);
  const regionEnd = afterList.search(/const\s+vendorTypeWriteSchema/);
  const normalisationRegion = regionEnd === -1 ? afterList.slice(0, 1200) : afterList.slice(0, regionEnd);
  if (!/toLowerCase\(\)/.test(normalisationRegion)) {
    problems.push(
      `${ROUTE}: no case-normalisation between VENDOR_TYPE_VALUES and vendorTypeWriteSchema. The DB CHECK ` +
        `is CASE-SENSITIVE, so lowercase "other" must be canonicalised to "Other" rather than rejected or ` +
        `passed through to a 23514. (Other toLowerCase() calls in this file — e.g. the email transform — ` +
        `do not count and must not be allowed to satisfy this check.)`,
    );
  }

  return problems;
}

if (process.argv.includes("--selftest")) {
  const mig = `vendor_type IN ('Fuel', 'Repair', 'Tires', 'Towing', 'Insurance', 'Permit', 'Toll', 'Other')`;
  // Mirrors the real file: an UNRELATED toLowerCase() (the email transform) sits outside the vendor-type
  // region. The first version of this guard tested the whole file and so passed with the vendor-type
  // normalisation deleted — this shape is the regression bar.
  const ok = `export const VENDOR_TYPE_VALUES = ["Fuel", "Repair", "Tires", "Towing", "Insurance", "Permit", "Toll", "Other"] as const;
              const BY_LOWER = new Map(VENDOR_TYPE_VALUES.map((v) => [v.toLowerCase(), v]));
              const vendorTypeWriteSchema = z.string();
              const email = z.string().transform((v) => v.toLowerCase());`;
  const cases = [
    ["app list matches the DB CHECK exactly", ok, mig, 0],
    ["app accepts a value the DB forbids (the 500)", ok.replace('"Other"', '"Other", "Broker Services"'), mig, 1],
    ["app rejects a value the DB allows", ok.replace('"Toll", ', ""), mig, 1],
    ["bare z.string() — no list at all (the shipped defect)", `const vendorTypeSchema = z.string().max(100);`, mig, 1],
    // REGRESSION BAR — remove ONLY the vendor-type normalisation, leaving the unrelated email
    // toLowerCase() in place. The file-wide version of this check exited 0 here.
    ["case normalisation removed but email toLowerCase remains", ok.replace("[v.toLowerCase(), v]", "[v, v]"), mig, 1],
    ["migration CHECK unreadable — must not pass vacuously", ok, "-- no check here", 1],
  ];
  let failed = 0;
  for (const [name, route, migration, want] of cases) {
    const got = audit(route, migration).length;
    if (got !== want) {
      console.error(`SELFTEST FAIL: ${name} — expected ${want}, got ${got}`);
      failed++;
    }
  }
  if (failed) process.exit(1);
  console.log(`${LABEL} SELFTEST PASS — ${cases.length} mutations detected correctly`);
  process.exit(0);
}

for (const rel of [ROUTE, MIGRATION]) {
  if (!fs.existsSync(path.join(ROOT, rel))) {
    console.error(`${LABEL} FAIL — missing ${rel}; scope is wrong, refusing to pass vacuously.`);
    process.exit(1);
  }
}

const problems = audit(
  fs.readFileSync(path.join(ROOT, ROUTE), "utf8"),
  fs.readFileSync(path.join(ROOT, MIGRATION), "utf8"),
);
if (problems.length) {
  console.error(`${LABEL} FAIL — the vendor_type app contract and the DB CHECK disagree:\n`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    `\nFix: keep VENDOR_TYPE_VALUES in ${ROUTE} exactly equal to the CHECK list in ${MIGRATION}. ` +
      `If you are widening the DB (202611021200_vendors_vendor_type_check_relax.sql), widen the route in ` +
      `the SAME change — do NOT loosen one side alone.\n`,
  );
  process.exit(1);
}

console.log(`${LABEL} OK — vendor_type app list matches the DB CHECK (8 values), case-normalised.`);
process.exit(0);
