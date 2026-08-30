#!/usr/bin/env node
/** @independent-input DATABASE_URL — compares the declaration to an independently queried database schema. */
/**
 * META-GUARD — every column in the schema-drift baseline must EXIST in a real database.
 *
 * WHY THIS EXISTS: on 2026-07-28 the drift baseline was found to contain 495 columns (~5% of 9,262)
 * that exist on NO table. The parity parser had scanned a fixed window past each ALTER TABLE without
 * stopping at the statement end, so tables absorbed the FOLLOWING tables' columns, and `--update`
 * faithfully wrote the invention to disk. Every one of the 495 was checked against prod: all absent.
 *
 * The parser bug is fixed. This guard exists so the CLASS cannot return. It never reads the parser.
 * It reads the DATABASE — schema built from migrations 0001->head — and asserts that everything the
 * baseline claims actually exists. Whatever a future parser does, an invented column cannot survive
 * here, because a column that exists nowhere cannot be found in information_schema.
 *
 * That is the difference between fixing a bug and closing a class: the first trusts the parser to
 * stay correct, the second stops trusting it entirely.
 *
 * Requires a migrated database (DATABASE_DIRECT_URL / DATABASE_URL). Registered in
 * scripts/verify-meta.json db_gated_verify_scripts, so it SKIPs locally with an explicit capability
 * preflight and RUNS in CI's build-typecheck, which resets and migrates a real database first.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = path.join(ROOT, "docs/schema-parity-baseline.json");
const LABEL = "verify-baseline-columns-exist-in-db";

/** Baseline shape: { tables: { "schema.table": ["col", ...] } } (tolerates a bare map too). */
export function readBaseline(raw) {
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  const tables = parsed.tables ?? parsed;
  const out = new Map();
  for (const [rel, cols] of Object.entries(tables)) {
    if (!Array.isArray(cols)) continue;
    out.set(rel.toLowerCase(), new Set(cols.map((c) => String(c).toLowerCase())));
  }
  return out;
}

/** Pure comparison so the selftest can exercise it with no database. */
export function findPhantoms(baseline, liveColumns) {
  const phantoms = [];
  for (const [rel, cols] of baseline) {
    const live = liveColumns.get(rel);
    if (!live) continue; // table absence is verify-schema-parity's job, not this guard's
    for (const col of cols) {
      if (!live.has(col)) phantoms.push(`${rel}.${col}`);
    }
  }
  return phantoms;
}

async function loadLiveColumns(connectionString) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query(
      `SELECT table_schema, table_name, column_name
         FROM information_schema.columns
        WHERE table_schema NOT IN ('pg_catalog','information_schema')`
    );
    const map = new Map();
    for (const r of res.rows) {
      const rel = `${r.table_schema}.${r.table_name}`.toLowerCase();
      if (!map.has(rel)) map.set(rel, new Set());
      map.get(rel).add(String(r.column_name).toLowerCase());
    }
    return map;
  } finally {
    await client.end();
  }
}

async function main() {
  if (process.argv.includes("--selftest")) return selftest();

  // EXPLICIT CAPABILITY PREFLIGHT (not a silent pass): this guard's whole value is comparing the
  // baseline against a REAL database, so with no database there is nothing to compare and failing
  // would only train people to ignore it locally. It is NOT wired through package.json — Rule 17
  // reserves guard wiring to scripts/verify-steps/ — so it declares its own skip here and names the
  // job that runs it for real. CI's build-typecheck resets and migrates a database before the
  // verify-step suite, so the check is always executed for real there; only the developer laptop
  // skips, and it says so out loud.
  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.log(
      `${LABEL} SKIP-capability: database → ci / build-typecheck (no DATABASE_DIRECT_URL or ` +
        `DATABASE_URL). The baseline-vs-database comparison runs for real in CI after db:reset.`
    );
    return;
  }

  const baseline = readBaseline(fs.readFileSync(BASELINE, "utf8"));

  let live;
  try {
    live = await loadLiveColumns(connectionString);
  } catch (error) {
    // verify:static deliberately points DATABASE_URL at a dead sentinel port so no static guard can
    // reach a database. An UNREACHABLE database is the same capability gap as an unset one, so it
    // skips loudly rather than failing — a red that only means "you are on a laptop" teaches people
    // to ignore reds. A genuinely broken CI database cannot hide here: build-typecheck runs db:reset
    // and migrations BEFORE this step, so an unreachable database fails long before this guard.
    const code = error?.code ?? "";
    if (["ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH", "ETIMEDOUT"].includes(code)) {
      console.log(
        `${LABEL} SKIP-capability: database → ci / build-typecheck (unreachable: ${code}). ` +
          `The baseline-vs-database comparison runs for real in CI after db:reset.`
      );
      return;
    }
    throw error;
  }
  const phantoms = findPhantoms(baseline, live);

  const tracked = [...baseline.values()].reduce((n, s) => n + s.size, 0);
  if (phantoms.length > 0) {
    console.error(
      `${LABEL} FAILED — the drift baseline claims ${phantoms.length} column(s) that exist on NO table ` +
        `in a freshly-migrated database. A baseline that invents columns cannot detect a real removal ` +
        `and reports work that was never done. Regenerate it with a correct parser; do NOT allowlist.\n  - ` +
        phantoms.slice(0, 25).join("\n  - ") +
        (phantoms.length > 25 ? `\n  … +${phantoms.length - 25} more` : "")
    );
    process.exit(1);
  }
  console.log(`${LABEL} OK — all ${tracked} baseline columns across ${baseline.size} tables exist in the database.`);
}

function selftest() {
  const baseline = readBaseline({
    tables: {
      "demo.alpha": ["real_col", "another_real_col"],
      "demo.beta": ["beta_col"],
    },
  });
  const live = new Map([
    ["demo.alpha", new Set(["real_col", "another_real_col"])],
    ["demo.beta", new Set(["beta_col"])],
  ]);

  const clean = findPhantoms(baseline, live);
  if (clean.length !== 0) {
    console.error(`SELFTEST FAIL: a truthful baseline reported phantoms: ${clean.join(", ")}`);
    process.exit(1);
  }
  console.log("  ok: a baseline matching the database reports no phantoms");

  // Inject ONE phantom, exactly the #3715 shape (a column that belongs to a different table).
  baseline.get("demo.alpha").add("beta_col");
  const caught = findPhantoms(baseline, live);
  if (!caught.includes("demo.alpha.beta_col")) {
    console.error(`SELFTEST FAIL: an injected phantom column was NOT flagged (got ${JSON.stringify(caught)})`);
    process.exit(1);
  }
  console.log("  caught: a column present in the baseline but on no table (the #3715 class)");

  // A table absent from the DB must NOT be reported here — that is verify-schema-parity's job.
  const withMissingTable = readBaseline({ tables: { "demo.gamma": ["x"] } });
  if (findPhantoms(withMissingTable, live).length !== 0) {
    console.error("SELFTEST FAIL: a missing TABLE was reported as a phantom column (wrong guard's job)");
    process.exit(1);
  }
  console.log("  ok: an absent table is left to verify-schema-parity, not double-reported here");

  console.log("SELFTEST PASS — truthful baseline clean, injected phantom caught, scope boundary held.");
}

await main();
