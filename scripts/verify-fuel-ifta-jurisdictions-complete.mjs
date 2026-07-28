#!/usr/bin/env node
/**
 * FUEL-07 — the IFTA jurisdiction catalog must carry the full member set, and nothing else.
 *
 * The defect: `catalogs.fuel_tax_jurisdictions` was EMPTY on prod (verified 2026-07-28: n_live_tup
 * = 0 AND count(*) = 0, a genuine zero read two independent ways). Only five sample states had ever
 * been specified, and they were not present either. An IFTA quarterly return is filed against the
 * member-jurisdiction set — with an empty or partial catalog, no filable return exists for any
 * entity.
 *
 * THE STANDARD (IFTA, Inc. — iftach.org): 58 member jurisdictions — the 48 contiguous US states plus
 * 10 Canadian provinces. Alaska, Hawaii, the District of Columbia and the three Canadian territories
 * (Yukon, Northwest Territories, Nunavut) are NOT members.
 *
 * This guard asserts BOTH directions, because each is a real filing error:
 *   · a MISSING member  → miles run in that jurisdiction cannot be reported.
 *   · an EXTRA non-member → offers a jurisdiction that cannot legally appear on a return.
 *
 * It is a STATIC guard over db/migrations, so it holds in CI with no database. Comments are stripped
 * first: a code that appears only in prose must not count as seeded.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const MIGRATIONS = join(ROOT, "db/migrations");

/** The 48 contiguous US states. Excludes AK, HI and DC — none is an IFTA member. */
const US_MEMBERS = [
  "AL", "AR", "AZ", "CA", "CO", "CT", "DE", "FL", "GA", "IA", "ID", "IL", "IN", "KS", "KY", "LA",
  "MA", "MD", "ME", "MI", "MN", "MO", "MS", "MT", "NC", "ND", "NE", "NH", "NJ", "NM", "NV", "NY",
  "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VA", "VT", "WA", "WI", "WV", "WY",
];
/** The 10 Canadian provinces. Excludes YT, NT and NU — the territories are not IFTA members. */
const CA_MEMBERS = ["AB", "BC", "MB", "NB", "NL", "NS", "ON", "PE", "QC", "SK"];

const CANONICAL = [...US_MEMBERS.map((c) => `US-${c}`), ...CA_MEMBERS.map((c) => `CA-${c}`)];
const NON_MEMBERS = ["US-AK", "US-HI", "US-DC", "CA-YT", "CA-NT", "CA-NU"];

/** Strip SQL line and block comments so prose never counts as a seeded code. */
function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

/**
 * Collect the jurisdiction codes a migration actually seeds. Two shapes exist in this repo:
 *   1. literal — INSERT ... VALUES (..., 'US-TX', ...)      (the 0067 sample seed)
 *   2. array-built — 'US-' || v_us_codes[i] over ARRAY[...]  (the FUEL-07 full seed)
 * A guard that understood only one shape would silently pass while the catalog was wrong.
 */
function seededCodes(sql) {
  const codes = new Set();

  for (const m of sql.matchAll(/'((?:US|CA)-[A-Z]{2})'/g)) codes.add(m[1]);

  const arrayFor = (namePattern, prefix) => {
    const re = new RegExp(`${namePattern}[^:]*:=\\s*ARRAY\\s*\\[([^\\]]*)\\]`, "i");
    const found = re.exec(sql);
    if (!found) return;
    for (const c of found[1].matchAll(/'([A-Z]{2})'/g)) codes.add(`${prefix}-${c[1]}`);
  };
  arrayFor("v_us_codes", "US");
  arrayFor("v_ca_codes", "CA");

  return codes;
}

export function run() {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"));
  const relevant = [];
  const seeded = new Set();

  for (const f of files) {
    const raw = readFileSync(join(MIGRATIONS, f), "utf8");
    if (!/fuel_tax_jurisdictions/.test(raw)) continue;
    const sql = stripComments(raw);
    if (!/fuel_tax_jurisdictions/.test(sql)) continue; // mentioned only in a comment
    relevant.push(f);
    for (const c of seededCodes(sql)) seeded.add(c);
  }

  if (relevant.length === 0) {
    return {
      ok: false,
      seeded: [],
      missing: CANONICAL,
      extra: [],
      message:
        "FAIL: no migration seeds catalogs.fuel_tax_jurisdictions at all — the IFTA jurisdiction " +
        "catalog has no source, so no filable return can be produced for any entity.",
    };
  }

  const missing = CANONICAL.filter((c) => !seeded.has(c));
  const extra = NON_MEMBERS.filter((c) => seeded.has(c));
  const ok = missing.length === 0 && extra.length === 0;

  return {
    ok,
    files: relevant,
    seededCount: [...seeded].filter((c) => CANONICAL.includes(c)).length,
    missing,
    extra,
    message: ok
      ? `PASS: all ${CANONICAL.length} of ${CANONICAL.length} IFTA member jurisdictions are seeded ` +
        `(48 US + 10 CA), and no non-member is present.`
      : [
          `FAIL: the IFTA jurisdiction catalog does not match the member set.`,
          missing.length
            ? `  MISSING ${missing.length} of ${CANONICAL.length}: ${missing.join(", ")} — ` +
              `miles run in these cannot be reported on a return.`
            : null,
          extra.length
            ? `  NOT AN IFTA MEMBER (must not be offered): ${extra.join(", ")}.`
            : null,
        ]
          .filter(Boolean)
          .join("\n"),
  };
}

/**
 * The selftest removes a real member from the real migration source (in memory) and requires it to
 * be caught, and separately plants a non-member and requires THAT to be caught — both directions,
 * because a guard that only noticed omissions would happily let US-DC onto a filing.
 */
function selftest() {
  const baseline = run();
  if (!baseline.ok) {
    console.error(`SELFTEST FAIL: repository is already red before any mutation.\n${baseline.message}`);
    process.exit(1);
  }

  const target = join(MIGRATIONS, "202610050000_fuel_07_seed_full_ifta_jurisdictions.sql");
  const original = readFileSync(target, "utf8");

  // 1. Drop a member — Texas, the company's home jurisdiction.
  if (!original.includes("'TX'")) {
    console.error("SELFTEST FAIL: could not find 'TX' in the seed — the mutation would be a no-op.");
    process.exit(1);
  }
  const withoutTx = stripComments(original).replace("'TX',", "");
  const seededWithoutTx = seededCodes(withoutTx);
  if (seededWithoutTx.has("US-TX")) {
    console.error("SELFTEST FAIL: dropping 'TX' from the seed was not reflected in the parsed set.");
    process.exit(1);
  }
  console.log("  caught: a missing IFTA member (US-TX) is detected");

  // 2. Plant a non-member — DC is a classic wrong inclusion.
  const withDc = stripComments(original).replace("'DE',", "'DE','DC',");
  const seededWithDc = seededCodes(withDc);
  if (!seededWithDc.has("US-DC")) {
    console.error("SELFTEST FAIL: planting a non-member (US-DC) was not reflected in the parsed set.");
    process.exit(1);
  }
  console.log("  caught: a non-member (US-DC) would be flagged");

  const after = run();
  if (!after.ok) {
    console.error(`SELFTEST FAIL: the real source no longer passes.\n${after.message}`);
    process.exit(1);
  }
  console.log("SELFTEST PASS: both directions (missing member, extra non-member) are detected.");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const result = run();
  console.log(result.message);
  if (result.files) console.log(`  source migrations: ${result.files.join(", ")}`);
  if (!result.ok) process.exit(1);
}
