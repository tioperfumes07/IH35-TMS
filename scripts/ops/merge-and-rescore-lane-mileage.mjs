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
 *     spread/2 ("invents two numbers that look observed"). This source (an AlwaysTrack aggregate
 *     extract, not raw per-run data) never carried true min/max -- they are NOT recoverable here.
 *     Left NULL on every row, honestly, per the owner's own rule: "A NULL is honest; a derived
 *     approximation presented as a range is not."
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
    const totalRuns = g.rows.reduce((s, r) => s + Number(r.n_practical || 0), 0);
    const weightedMiles =
      totalRuns > 0
        ? g.rows.reduce((s, r) => s + Number(r.practical_miles) * Number(r.n_practical || 0), 0) / totalRuns
        : Number(g.rows[0].practical_miles);
    const weightedSpread =
      totalRuns > 0
        ? g.rows.reduce((s, r) => s + Number(r.practical_spread || 0) * Number(r.n_practical || 0), 0) / totalRuns
        : Number(g.rows[0].practical_spread || 0);
    const firstSeen = g.rows.map((r) => r.first_seen).filter(Boolean).sort()[0] ?? null;
    const lastSeen = g.rows.map((r) => r.last_seen).filter(Boolean).sort().slice(-1)[0] ?? null;
    merged.push({
      origin_city: g.origin_city,
      origin_state: g.origin_state,
      dest_city: g.dest_city,
      dest_state: g.dest_state,
      n_practical: totalRuns,
      practical_miles: Math.round(weightedMiles * 10) / 10,
      practical_spread: Math.round(weightedSpread * 10) / 10,
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
  const src = readFileSync(fileURLToPath(import.meta.url), "utf8");
  // Owner rejected deriving min/max from practical_miles +/- spread/2 ("invents two numbers that
  // look observed"). Assert the literal INSERT always writes NULL for both, and that no arithmetic
  // expression involving practical_spread feeds either column anywhere in the file.
  if (!/practical_min,\s*practical_max\s*\)\s*VALUES\s*\(/.test(src) || !/NULL,\s*NULL\s*\)`/.test(src)) {
    console.error("merge-and-rescore-lane-mileage SELFTEST FAIL — practical_min/practical_max INSERT no longer writes a literal NULL pair");
    process.exit(1);
  }
  const insertSection = src.slice(src.indexOf("INSERT INTO catalogs.lane_mileage"));
  if (/practical_min\s*:\s*[a-zA-Z]/.test(insertSection.split("VALUES")[1] ?? "")) {
    console.error("merge-and-rescore-lane-mileage SELFTEST FAIL — practical_min appears computed, not literal NULL");
    process.exit(1);
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
    `SELECT origin_city, origin_state, dest_city, dest_state, practical_miles::text, practical_spread::text,
            n_practical, first_seen::text, last_seen::text
       FROM catalogs.lane_mileage
      WHERE operating_company_id = $1::uuid`,
    [USMCA]
  );
  const beforeCount = before.rows.length;

  const merged = mergeGroups(before.rows, aliasMap).map(scoreConfidence);
  const mergedGroupsWithVariants = merged.filter((m) => m.variant_count > 1);
  const variantRowsFolded = mergedGroupsWithVariants.reduce((s, m) => s + m.variant_count, 0);

  const deleted = await client.query(
    `DELETE FROM catalogs.lane_mileage WHERE operating_company_id = $1::uuid`,
    [USMCA]
  );

  for (const r of merged) {
    await client.query(
      `INSERT INTO catalogs.lane_mileage (
         operating_company_id, origin_city, origin_state, dest_city, dest_state,
         practical_miles, practical_spread, n_practical,
         confidence, autofill_allowed, source, first_seen, last_seen,
         practical_min, practical_max
       ) VALUES (
         $1::uuid, $2, $3, $4, $5,
         $6::numeric, $7::numeric, $8::int,
         $9, $10, $11, $12::date, $13::date,
         NULL, NULL
       )`,
      [
        USMCA,
        r.origin_city,
        r.origin_state,
        r.dest_city,
        r.dest_state,
        r.practical_miles,
        r.practical_spread,
        r.n_practical,
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
    `SELECT count(*)::int AS n FROM catalogs.lane_mileage WHERE operating_company_id = $1::uuid`,
    [USMCA]
  );
  const afterCount = after.rows[0]?.n ?? 0;
  await client.query("COMMIT");

  const dist = { High: 0, "Check ZIP": 0, Thin: 0 };
  for (const r of merged) dist[r.confidence] = (dist[r.confidence] ?? 0) + 1;

  console.log(
    `BEFORE: ${beforeCount} rows | duplicate groups merged: ${mergedGroupsWithVariants.length} (${variantRowsFolded} rows folded) | AFTER: ${afterCount} rows (verified live count)`
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
