#!/usr/bin/env node
/**
 * ROUND 182 item 5 — location_city on fuel.fuel_transactions must actually be a city: never a
 * street address (a street number jammed against the street name, e.g. "101 PINNACLE ROAD",
 * "21548FM471S NATALIA,TX") and never a product/category description leaking in from an empty
 * source Location field (e.g. "Fuel-DEF-Diesel Exhaust Fluid", "DEF"). That silent corruption is
 * exactly what let 450 rows rot with garbage in this column with nothing ever catching it.
 *
 * Static half (always runs, never skipped): asserts apps/backend/src/feed/seed-settlement-
 * document.service.ts's seedFuel() writer calls sanitizeFuelLocation() before it INSERTs
 * location_city, rather than writing the raw truth-JSON location string directly.
 *
 * Live half (bypass_rls; SKIPs cleanly with no DATABASE_URL, per this repo's ALLOW_OFFLINE_SKIP
 * convention -- the static check above is sufficient offline on its own): fails if any live,
 * non-voided fuel.fuel_transactions row in USMCA has a location_city that starts with a digit or
 * contains a known product-category term.
 *
 * Run: node scripts/verify-fuel-location-is-a-city.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ALLOW_OFFLINE_SKIP = true;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SVC = "apps/backend/src/feed/seed-settlement-document.service.ts";
const LABEL = "verify-fuel-location-is-a-city";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const KNOWN_LOCATION_PRODUCT_TERMS = ["fuel", "def", "diesel", "reefer", "lumper", "scale", "tire", "washout"];

export function checkStaticSource(src) {
  const problems = [];
  if (!src.includes("sanitizeFuelLocation(")) {
    problems.push(`${SVC}: sanitizeFuelLocation() not found -- seedFuel() must sanitize before writing location_city, not copy the raw truth-JSON string`);
    return problems;
  }
  const idx = src.indexOf("INSERT INTO fuel.fuel_transactions");
  if (idx === -1) {
    problems.push(`${SVC}: no INSERT INTO fuel.fuel_transactions found`);
    return problems;
  }
  const insertBlock = src.slice(idx, idx + 900);
  if (!/locationCity/.test(insertBlock)) {
    problems.push(`${SVC}: the fuel.fuel_transactions INSERT does not reference the sanitized locationCity variable -- was it reverted to line.location?`);
  }
  return problems;
}

export function checkStatic(root = ROOT) {
  let src;
  try {
    src = fs.readFileSync(path.join(root, SVC), "utf8");
  } catch {
    return [`${SVC}: missing`];
  }
  return checkStaticSource(src);
}

async function checkLive() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log(`  ${LABEL} (live check): SKIP — no DATABASE_URL (the static check above already passed and is sufficient offline).`);
    return [];
  }
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: url, max: 2 });
  const client = await pool.connect();
  try {
    await client.query(`SELECT set_config('app.bypass_rls','lucia',true)`);
    const res = await client.query(
      `SELECT id::text, location_city
         FROM fuel.fuel_transactions
        WHERE operating_company_id = $1::uuid
          AND voided_at IS NULL
          AND location_city IS NOT NULL
          AND (location_city ~ '^[0-9]' OR lower(location_city) ~ ANY($2::text[]))`,
      [USMCA, KNOWN_LOCATION_PRODUCT_TERMS]
    );
    if (res.rows.length > 0) {
      return res.rows.slice(0, 10).map((r) => `${r.id}: location_city="${r.location_city}"`);
    }
    return [];
  } finally {
    client.release();
    await pool.end();
  }
}

export function runSelftest() {
  const cases = [
    { name: "no sanitizer at all", src: "const x = 1;\nINSERT INTO fuel.fuel_transactions (a) VALUES ($1)", expectFail: true },
    { name: "no INSERT at all", src: "function sanitizeFuelLocation(){}\n", expectFail: true },
    { name: "sanitizer present but INSERT still uses raw line.location", src: "function sanitizeFuelLocation(){}\nINSERT INTO fuel.fuel_transactions (location_city) VALUES ($7)\n[a, line.location, b]", expectFail: true },
    { name: "sanitizer present and INSERT uses locationCity", src: "function sanitizeFuelLocation(){}\nINSERT INTO fuel.fuel_transactions (location_city) VALUES ($7)\n[a, locationCity, b]", expectFail: false },
  ];
  let failures = 0;
  for (const c of cases) {
    const problems = checkStaticSource(c.src);
    const gotFail = problems.length > 0;
    if (gotFail !== c.expectFail) {
      failures += 1;
      console.error(`  SELFTEST FAIL: "${c.name}" expected fail=${c.expectFail}, got fail=${gotFail}`);
    }
  }
  if (failures > 0) {
    console.error(`${LABEL} --selftest FAIL (${failures} case(s))`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS ${cases.length}/${cases.length}`);
}

async function main() {
  const problems = checkStatic();
  if (problems.length > 0) {
    console.error(`${LABEL} FAIL (static):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS (static): sanitizeFuelLocation() wired into seedFuel()'s INSERT.`);

  const liveProblems = await checkLive();
  if (liveProblems.length > 0) {
    console.error(`${LABEL} FAIL (live): ${liveProblems.length} row(s) with a corrupted location_city:`);
    for (const p of liveProblems) console.error(`  - ${p}`);
    process.exit(1);
  }
}

if (process.argv.includes("--selftest")) {
  runSelftest();
} else {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
