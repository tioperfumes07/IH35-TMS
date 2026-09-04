#!/usr/bin/env node
/**
 * merge-and-rescore-lane-mileage.mjs
 *
 * GO-19-2b Section 0 defects (a)+(b), owner-approved 2026-09-03:
 *
 * (a) 126 lane keys carry 2+ spelling/formatting variants of the SAME lane (a ", STATE" suffix
 *     duplicate, e.g. "SIOUX CITY -> LAREDO" vs "SIOUX CITY, TX -> LAREDO, TX", plus real spelling
 *     typos reviewed and decided in db/seeds/city-alias-review.csv, e.g. MOUNMOUTH -> MONMOUTH).
 *     Scoring confidence on the un-merged rows splits run counts across variants (367 runs vs 9
 *     runs treated as two different lanes) -- exactly the input the new confidence formula weighs
 *     on. MERGE FIRST, recompute n_practical/practical_miles/practical_spread as a run-count-
 *     weighted pool of the merged group, THEN rescore.
 *
 * (b) practical_min/practical_max: the owner REJECTED deriving them as practical_miles +/-
 *     spread/2 ("invents two numbers that look observed"). UPDATED 2026-09-04
 *     (LANE-MILEAGE-SHORT-EMPTY-DROPPED): the 2026-09-03 AlwaysTrack aggregate extract never
 *     carried true min/max, so NULL was the only honest choice then. The current source
 *     (db/seeds/lane-mileage-usmca.csv, rebuilt 2026-09-04) DOES carry real per-row
 *     practical_min/practical_max/short_min/short_max -- merging duplicate-spelling variants of
 *     the same real lane by MIN-of-observed-mins / MAX-of-observed-maxes is honest aggregation of
 *     real data, not the rejected formula. Still never derived from spread/2; still NULL when a
 *     group has no rows carrying a real value for that field.
 *
 * (c) short_miles/n_short/short_min/short_max/empty_miles (owner-verified live 2026-09-04): the
 *     prior version of this script's `before` SELECT and INSERT never read or wrote these 5
 *     columns at all, so every run of THIS script silently deleted whatever values a correct seed
 *     import had written and reinserted rows without them -- the actual mechanism behind "0 of
 *     3,006 live lanes have short_miles/empty_miles" despite the seed source having both. Fixed by
 *     carrying them through mergeGroups() with their own independent weighting (short_miles by
 *     n_short, NOT by n_practical -- a lane can have short-route observations with zero practical
 *     observations, or vice versa) and writing them in the same INSERT as everything else.
 *
 * CONFIDENCE FORMULA (owner-approved, run-count + RELATIVE spread, not absolute miles):
 *   High:      n_practical >= 3  AND relative_spread_pct <= 5
 *   Check ZIP: n_practical >= 2  AND relative_spread_pct <= 15
 *   Thin:      everything else
 *   autofill_allowed = confidence IN (High, Check ZIP)
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const ALIAS_CSV = join(ROOT, "db/seeds/city-alias-review.csv");

function parseCsv(text) {
  const table = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((x) => x.length > 0)) table.push(row);
      row = [];
      continue;
    }
    field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((x) => x.length > 0)) table.push(row);
  }
  const headers = (table[0] ?? []).map((h) => h.trim());
  return table.slice(1).map((cols) => {
    const out = {};
    headers.forEach((h, i) => (out[h] = cols[i] ?? ""));
    return out;
  });
}

/** Strips a trailing ", <STATE>" suffix that duplicates the row's own state column. */
export function stripStateSuffix(city, state) {
  const re = new RegExp(`,\\s*${state}$`, "i");
  return city.trim().replace(re, "").trim();
}

/** Owner queue item 1: "upper, strip punctuation, collapse whitespace, split trailing state."
 * Also folds SAINT -> ST (matching the alias-review.csv's own established convention: its one
 * ST/SAINT decision, MO ST LOUIS / ST. LOUIS, chose the abbreviated "St Louis" as canonical). */
export function stripPunctuationAndWhitespace(city) {
  return city
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^SAINT\b/, "ST");
}

/** Builds a per-state variant(normalized) -> canonical(normalized) map from the reviewed alias
 * CSV. Both sides run through the SAME stripPunctuationAndWhitespace as the live-row lookup, or
 * a punctuated variant/canonical (e.g. "MT. PLEASANT") would never match the stripped lookup key. */
export function buildAliasMap(csvText) {
  const rows = parseCsv(csvText).filter((r) => r.Decision === "MERGE");
  const map = new Map(); // key: `${state}|${normalizedVariant}` -> normalizedCanonical
  for (const r of rows) {
    const state = r.State.trim().toUpperCase();
    const canonical = stripPunctuationAndWhitespace(r.Canonical);
    for (const variant of [r["Variant A"], r["Variant B"]]) {
      const key = `${state}|${stripPunctuationAndWhitespace(variant)}`;
      map.set(key, canonical);
    }
  }
  return map;
}

export function normalizeCity(city, state, aliasMap) {
  const stripped = stripPunctuationAndWhitespace(stripStateSuffix(city, state));
  const aliased = aliasMap.get(`${state.toUpperCase()}|${stripped}`);
  return aliased ?? stripped;
}

export function mergeGroups(rows, aliasMap) {
  const groups = new Map();
  for (const r of rows) {
    const normOrigin = normalizeCity(r.origin_city, r.origin_state, aliasMap);
    const normDest = normalizeCity(r.dest_city, r.dest_state, aliasMap);
    const key = `${normOrigin}|${r.origin_state}|${normDest}|${r.dest_state}`;
    if (!groups.has(key)) {
      groups.set(key, {
        origin_city: normOrigin,
        origin_state: r.origin_state,
        dest_city: normDest,
        dest_state: r.dest_state,
        rows: [],
      });
    }
    groups.get(key).rows.push(r);
  }

  const merged = [];
  for (const g of groups.values()) {
    // LANE-MILEAGE-SHORT-EMPTY-DROPPED (2026-09-04): practical_* and short_* are independent
    // observation sets on this source -- 26 lanes have short_miles with NO practical data at all
    // (n_practical=0), and short_miles is blank/NULL on 105 lanes that DO have practical data.
    // Weighting practical_miles by n_practical must only sum over rows that actually HAVE
    // practical data (Number(null) === 0 would silently zero-weight a real value into the
    // average otherwise); short_miles gets its OWN independent weighted average by n_short.
    const practicalRows = g.rows.filter((r) => r.practical_miles != null && r.practical_miles !== "");
    const totalRuns = practicalRows.reduce((s, r) => s + Number(r.n_practical || 0), 0);
    const weightedMiles =
      totalRuns > 0
        ? practicalRows.reduce((s, r) => s + Number(r.practical_miles) * Number(r.n_practical || 0), 0) / totalRuns
        : practicalRows.length > 0
          ? Number(practicalRows[0].practical_miles)
          : null;
    const weightedSpread =
      totalRuns > 0
        ? practicalRows.reduce((s, r) => s + Number(r.practical_spread || 0) * Number(r.n_practical || 0), 0) / totalRuns
        : practicalRows.length > 0
          ? Number(practicalRows[0].practical_spread || 0)
          : null;
    const practicalMins = practicalRows.map((r) => Number(r.practical_min)).filter(Number.isFinite);
    const practicalMaxs = practicalRows.map((r) => Number(r.practical_max)).filter(Number.isFinite);

    // LANE-MILEAGE-SHORT-MILES-REGRESSION (owner order 2026-09-04, URGENT, reverses (c) above):
    // this source's short_miles is the AlwaysTrack St. Miles blend (Loaded + Empty), never an
    // independent shortest-route figure -- there is nothing here to weight-average or merge.
    // ALWAYS null/null/null/0, regardless of what any variant row in the group carries. Do not
    // resurrect the weighted-merge logic (c) above described; it merged garbage honestly, which
    // is still garbage.
    const weightedShortMiles = null;
    const shortMins = [];
    const shortMaxs = [];
    const totalNShort = 0;

    const emptyRows = g.rows.filter((r) => r.empty_miles != null && r.empty_miles !== "");
    const weightedEmptyMiles =
      totalRuns > 0 && emptyRows.length > 0
        ? emptyRows.reduce((s, r) => s + Number(r.empty_miles) * Number(r.n_practical || 0), 0) /
          emptyRows.reduce((s, r) => s + Number(r.n_practical || 0), 0)
        : emptyRows.length > 0
          ? Number(emptyRows[0].empty_miles)
          : 0;

    const firstSeen = g.rows.map((r) => r.first_seen).filter(Boolean).sort()[0] ?? null;
    const lastSeen = g.rows.map((r) => r.last_seen).filter(Boolean).sort().slice(-1)[0] ?? null;
    merged.push({
      origin_city: g.origin_city,
      origin_state: g.origin_state,
      dest_city: g.dest_city,
      dest_state: g.dest_state,
      n_practical: totalRuns,
      practical_miles: weightedMiles != null ? Math.round(weightedMiles * 10) / 10 : null,
      practical_spread: weightedSpread != null ? Math.round(weightedSpread * 10) / 10 : null,
      // True observed extremes across the merged variants -- never derived from spread/2 (owner
      // rejected that formula 2026-09-03). This source provides real per-row min/max; merging
      // duplicate-spelling variants of the SAME lane by MIN-of-mins/MAX-of-maxes is honest
      // aggregation of already-observed data, not fabrication.
      practical_min: practicalMins.length > 0 ? Math.min(...practicalMins) : null,
      practical_max: practicalMaxs.length > 0 ? Math.max(...practicalMaxs) : null,
      short_miles: weightedShortMiles != null ? Math.round(weightedShortMiles * 10) / 10 : null,
      short_min: shortMins.length > 0 ? Math.min(...shortMins) : null,
      short_max: shortMaxs.length > 0 ? Math.max(...shortMaxs) : null,
      n_short: totalNShort,
      empty_miles: Math.round(weightedEmptyMiles * 10) / 10,
      first_seen: firstSeen,
      last_seen: lastSeen,
      variant_count: g.rows.length,
    });
  }
  return merged;
}

export function scoreConfidence(row) {
  const relSpreadPct = row.practical_miles > 0 ? (row.practical_spread / row.practical_miles) * 100 : Infinity;
  let confidence;
  if (row.n_practical >= 3 && relSpreadPct <= 5) confidence = "High";
  else if (row.n_practical >= 2 && relSpreadPct <= 15) confidence = "Check ZIP";
  else confidence = "Thin";
  const autofill_allowed = confidence === "High" || confidence === "Check ZIP";
  return { ...row, confidence, autofill_allowed, rel_spread_pct: relSpreadPct };
}

if (process.argv.includes("--selftest")) {
  const aliasMap = buildAliasMap(readFileSync(ALIAS_CSV, "utf8"));
  // (1) suffix strip + alias merge collapse 3 spelling variants of one lane to one group.
  const fixture = [
    { origin_city: "SIOUX CITY", origin_state: "IA", dest_city: "LAREDO", dest_state: "TX", practical_miles: "1164.8", practical_spread: "48.0", n_practical: 162, first_seen: "2024-01-01", last_seen: "2024-06-01" },
    { origin_city: "SIOUX CITY", origin_state: "IA", dest_city: "LAREDO, TX", dest_state: "TX", practical_miles: "1164.8", practical_spread: "1.6", n_practical: 9, first_seen: "2025-01-01", last_seen: "2025-02-01" },
    { origin_city: "MOUNMOUTH", origin_state: "IL", dest_city: "LAREDO", dest_state: "TX", practical_miles: "900.0", practical_spread: "10.0", n_practical: 5, first_seen: "2024-05-01", last_seen: "2024-05-01" },
  ];
  const merged = mergeGroups(fixture, aliasMap);
  if (merged.length !== 2) {
    console.error(`merge-and-rescore-lane-mileage SELFTEST FAIL — expected 2 merged groups, got ${merged.length}`);
    process.exit(1);
  }
  // (1b) generic punctuation/whitespace/SAINT-ST variants (owner queue item 1's exact spec) also
  // collapse, independent of the curated alias CSV.
  const punctFixture = [
    { origin_city: "BEARDSTOWN", origin_state: "IL", dest_city: "LAREDO", dest_state: "TX", practical_miles: "800.0", practical_spread: "5.0", n_practical: 30, first_seen: "2024-01-01", last_seen: "2024-06-01" },
    { origin_city: "BEARDSTOWN,", origin_state: "IL", dest_city: "LAREDO", dest_state: "TX", practical_miles: "800.0", practical_spread: "5.0", n_practical: 8, first_seen: "2024-02-01", last_seen: "2024-03-01" },
    { origin_city: "SAINT JOSEPH", origin_state: "MO", dest_city: "PHARR", dest_state: "TX", practical_miles: "700.0", practical_spread: "3.0", n_practical: 3, first_seen: "2024-01-01", last_seen: "2024-01-01" },
    { origin_city: "ST JOSEPH", origin_state: "MO", dest_city: "(PHARR", dest_state: "TX", practical_miles: "700.0", practical_spread: "2.0", n_practical: 2, first_seen: "2024-02-01", last_seen: "2024-02-01" },
  ];
  const punctMerged = mergeGroups(punctFixture, aliasMap);
  if (punctMerged.length !== 2) {
    console.error(`merge-and-rescore-lane-mileage SELFTEST FAIL — expected 2 punctuation-merged groups, got ${punctMerged.length}: ${JSON.stringify(punctMerged.map((m) => [m.origin_city, m.dest_city]))}`);
    process.exit(1);
  }
  const beardstown = punctMerged.find((m) => m.origin_city === "BEARDSTOWN");
  if (!beardstown || beardstown.n_practical !== 38) {
    console.error("merge-and-rescore-lane-mileage SELFTEST FAIL — trailing-comma punctuation variant did not merge");
    process.exit(1);
  }
  const stJoseph = punctMerged.find((m) => m.origin_city === "ST JOSEPH");
  if (!stJoseph || stJoseph.n_practical !== 5 || stJoseph.dest_city !== "PHARR") {
    console.error("merge-and-rescore-lane-mileage SELFTEST FAIL — SAINT->ST fold or stray-paren strip did not merge");
    process.exit(1);
  }
  const sioux = merged.find((m) => m.origin_city === "SIOUX CITY");
  if (!sioux || sioux.n_practical !== 171 || sioux.variant_count !== 2) {
    console.error(`merge-and-rescore-lane-mileage SELFTEST FAIL — SIOUX CITY merge wrong: ${JSON.stringify(sioux)}`);
    process.exit(1);
  }
  const monmouth = merged.find((m) => m.origin_city === "MONMOUTH");
  if (!monmouth) {
    console.error("merge-and-rescore-lane-mileage SELFTEST FAIL — alias-mapped MOUNMOUTH -> MONMOUTH did not merge/rename");
    process.exit(1);
  }
  // (2) rescore: high run count + tiny relative spread must score High even with a large absolute spread.
  const scored = scoreConfidence(sioux);
  if (scored.confidence !== "High" || !scored.autofill_allowed) {
    console.error(`merge-and-rescore-lane-mileage SELFTEST FAIL — merged SIOUX CITY should score High, got ${JSON.stringify(scored)}`);
    process.exit(1);
  }
  // (3) a single-run, high-relative-spread lane must stay Thin/OFF.
  const thin = scoreConfidence({ n_practical: 1, practical_miles: 100, practical_spread: 20 });
  if (thin.confidence !== "Thin" || thin.autofill_allowed) {
    console.error("merge-and-rescore-lane-mileage SELFTEST FAIL — single-run high-spread lane should stay Thin/OFF");
    process.exit(1);
  }
  // (4) practical_min/practical_max: real MIN-of-mins/MAX-of-maxes across merged variants, never
  // a spread/2 formula, never NULL when the group actually carries real per-row values.
  const minMaxFixture = [
    { origin_city: "DALLAS", origin_state: "TX", dest_city: "LAREDO", dest_state: "TX", practical_miles: "440.0", practical_spread: "5.0", practical_min: "435.0", practical_max: "445.0", n_practical: 3, first_seen: "2024-01-01", last_seen: "2024-06-01" },
    { origin_city: "DALLAS", origin_state: "TX", dest_city: "LAREDO, TX", dest_state: "TX", practical_miles: "440.0", practical_spread: "2.0", practical_min: "438.0", practical_max: "452.0", n_practical: 2, first_seen: "2024-07-01", last_seen: "2024-08-01" },
  ];
  const minMaxMerged = mergeGroups(minMaxFixture, aliasMap);
  const dallas = minMaxMerged.find((m) => m.origin_city === "DALLAS");
  if (!dallas || dallas.practical_min !== 435 || dallas.practical_max !== 452) {
    console.error(`merge-and-rescore-lane-mileage SELFTEST FAIL — practical_min/max not aggregated as true observed extremes: ${JSON.stringify(dallas)}`);
    process.exit(1);
  }
  // (5) LANE-MILEAGE-SHORT-MILES-REGRESSION (owner order 2026-09-04, reverses this comment's own
  // prior framing): short_miles/n_short/short_min/short_max must be discarded by the merge
  // ALWAYS, regardless of what any variant row carries -- the source's short_miles is the
  // AlwaysTrack blend, never an independent shortest-route figure. empty_miles still survives
  // (informational only, live-verified to never feed pay -- see seed-lane-mileage.mjs header).
  const shortEmptyFixture = [
    {
      origin_city: "TULSA", origin_state: "OK", dest_city: "LAREDO", dest_state: "TX",
      practical_miles: "620.0", practical_spread: "0", practical_min: "620.0", practical_max: "620.0", n_practical: 2,
      short_miles: "650.0", short_min: "645.0", short_max: "655.0", n_short: 2, empty_miles: "12.0",
      first_seen: "2024-01-01", last_seen: "2024-02-01",
    },
    {
      origin_city: "TULSA", origin_state: "OK", dest_city: "LAREDO, TX", dest_state: "TX",
      practical_miles: "620.0", practical_spread: "0", practical_min: "615.0", practical_max: "625.0", n_practical: 1,
      short_miles: "640.0", short_min: "640.0", short_max: "640.0", n_short: 1, empty_miles: "8.0",
      first_seen: "2024-03-01", last_seen: "2024-03-01",
    },
  ];
  const tulsa = mergeGroups(shortEmptyFixture, aliasMap).find((m) => m.origin_city === "TULSA");
  if (!tulsa || tulsa.short_miles !== null || tulsa.n_short !== 0 || tulsa.short_min !== null || tulsa.short_max !== null || tulsa.empty_miles <= 0) {
    console.error(`merge-and-rescore-lane-mileage SELFTEST FAIL — short_miles/n_short/short_min/short_max must always be discarded (empty_miles must still survive): ${JSON.stringify(tulsa)}`);
    process.exit(1);
  }
  // (6) a group with NO practical observation at all (only ever possible from a short-only
  // source row, which seed-lane-mileage.mjs no longer allows this far) still merges honestly to
  // practical_miles=null here -- filtering it out of the INSERT is the caller's job (below), not
  // this pure function's, so it stays observable/testable on its own.
  const shortOnlyFixture = [
    { origin_city: "ADRIAN", origin_state: "PA", dest_city: "LAREDO", dest_state: "TX", practical_miles: "", practical_spread: "", practical_min: "", practical_max: "", n_practical: "", short_miles: "338.4", short_min: "338.4", short_max: "338.4", n_short: 1, empty_miles: "", first_seen: "", last_seen: "" },
  ];
  const adrian = mergeGroups(shortOnlyFixture, aliasMap).find((m) => m.origin_city === "ADRIAN");
  if (!adrian || adrian.practical_miles !== null || adrian.short_miles !== null) {
    console.error(`merge-and-rescore-lane-mileage SELFTEST FAIL — short-only (no practical) lane mishandled: ${JSON.stringify(adrian)}`);
    process.exit(1);
  }
  const src2 = readFileSync(fileURLToPath(import.meta.url), "utf8");
  if (!/if \(r\.practical_miles == null\) continue;/.test(src2)) {
    console.error("merge-and-rescore-lane-mileage SELFTEST FAIL — the INSERT loop no longer skips practical_miles==null rows -- this would crash against the restored NOT NULL constraint");
    process.exit(1);
  }
  const src = readFileSync(fileURLToPath(import.meta.url), "utf8");
  const insertSection = src.slice(src.indexOf("INSERT INTO catalogs.lane_mileage"));
  for (const col of ["short_miles", "n_short", "short_min", "short_max", "empty_miles", "practical_min", "practical_max"]) {
    if (!insertSection.includes(col)) {
      console.error(`merge-and-rescore-lane-mileage SELFTEST FAIL — INSERT no longer writes ${col} (the exact class of silent-drop bug this file fixes)`);
      process.exit(1);
    }
  }
  console.log("merge-and-rescore-lane-mileage SELFTEST PASS");
  process.exit(0);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }
  const aliasMap = buildAliasMap(readFileSync(ALIAS_CSV, "utf8"));

  const client = new pg.Client({
    connectionString: url,
    ssl: url.includes("neon.tech") ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  await client.query("RESET ROLE");
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");

  const before = await client.query(
    `SELECT origin_city, origin_state, origin_postal_code, dest_city, dest_state, dest_postal_code,
            practical_miles::text, practical_spread::text, practical_min::text, practical_max::text,
            n_practical, short_miles::text, short_min::text, short_max::text, n_short,
            empty_miles::text, first_seen::text, last_seen::text
       FROM catalogs.lane_mileage
      WHERE operating_company_id = $1::uuid`,
    [USMCA]
  );
  const beforeCount = before.rows.length;
  // LANE-MILEAGE-SHORT-EMPTY-DROPPED (2026-09-04): count what THIS run's own `before` snapshot
  // actually carries, so the printed before/after proof is honest about what existed going in,
  // not assumed from the last time this script's author looked.
  const beforeShortPopulated = before.rows.filter((r) => r.short_miles != null).length;
  const beforeEmptyPositive = before.rows.filter((r) => Number(r.empty_miles) > 0).length;

  const merged = mergeGroups(before.rows, aliasMap).map(scoreConfidence);
  const mergedGroupsWithVariants = merged.filter((m) => m.variant_count > 1);
  const variantRowsFolded = mergedGroupsWithVariants.reduce((s, m) => s + m.variant_count, 0);

  const deleted = await client.query(
    `DELETE FROM catalogs.lane_mileage WHERE operating_company_id = $1::uuid`,
    [USMCA]
  );

  for (const r of merged) {
    // LANE-MILEAGE-SHORT-MILES-REGRESSION (owner order 2026-09-04): practical_miles is NOT NULL
    // again (migration 202613680001). A merged group with no practical observation at all (only
    // ever possible if a short-only source row reached this far, which seed-lane-mileage.mjs no
    // longer allows) has zero legitimate mileage content now that short_miles is always discarded
    // too -- skip it rather than crash the INSERT or fabricate a value.
    if (r.practical_miles == null) continue;
    await client.query(
      `INSERT INTO catalogs.lane_mileage (
         operating_company_id, origin_city, origin_state, dest_city, dest_state,
         practical_miles, practical_spread, practical_min, practical_max, n_practical,
         short_miles, short_min, short_max, n_short, empty_miles,
         confidence, autofill_allowed, source, first_seen, last_seen
       ) VALUES (
         $1::uuid, $2, $3, $4, $5,
         $6::numeric, $7::numeric, $8::numeric, $9::numeric, $10::int,
         $11::numeric, $12::numeric, $13::numeric, $14::int, $15::numeric,
         $16, $17, $18, $19::date, $20::date
       )`,
      [
        USMCA,
        r.origin_city,
        r.origin_state,
        r.dest_city,
        r.dest_state,
        r.practical_miles,
        r.practical_spread,
        r.practical_min,
        r.practical_max,
        r.n_practical,
        r.short_miles,
        r.short_min,
        r.short_max,
        r.n_short,
        r.empty_miles,
        r.confidence,
        r.autofill_allowed,
        "History",
        r.first_seen,
        r.last_seen,
      ]
    );
  }
  await client.query("COMMIT");

  await client.query("BEGIN");
  await client.query("RESET ROLE");
  await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
  const after = await client.query(
    `SELECT
       count(*)::int AS n,
       count(*) FILTER (WHERE short_miles IS NOT NULL)::int AS short_populated,
       count(*) FILTER (WHERE empty_miles > 0)::int AS empty_positive,
       count(*) FILTER (WHERE short_min IS NOT NULL)::int AS short_min_populated,
       count(*) FILTER (WHERE practical_min IS NOT NULL)::int AS practical_min_populated
     FROM catalogs.lane_mileage WHERE operating_company_id = $1::uuid`,
    [USMCA]
  );
  const afterCount = after.rows[0]?.n ?? 0;
  await client.query("COMMIT");

  const dist = { High: 0, "Check ZIP": 0, Thin: 0 };
  for (const r of merged) dist[r.confidence] = (dist[r.confidence] ?? 0) + 1;

  console.log(
    `BEFORE: ${beforeCount} rows (short_miles populated=${beforeShortPopulated}, empty_miles>0=${beforeEmptyPositive}) | duplicate groups merged: ${mergedGroupsWithVariants.length} (${variantRowsFolded} rows folded) | AFTER: ${afterCount} rows (verified live count)`
  );
  console.log(
    `AFTER per-column: short_miles populated=${after.rows[0].short_populated} · short_min populated=${after.rows[0].short_min_populated} · empty_miles>0=${after.rows[0].empty_positive} · practical_min populated=${after.rows[0].practical_min_populated}`
  );
  console.log(`Confidence distribution: High=${dist.High} · Check ZIP=${dist["Check ZIP"]} · Thin=${dist.Thin}`);
  if (afterCount !== merged.length) {
    console.error(`VERIFICATION FAILED — wrote ${merged.length} rows but live table count is ${afterCount}`);
    await client.end();
    process.exit(1);
  }
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
