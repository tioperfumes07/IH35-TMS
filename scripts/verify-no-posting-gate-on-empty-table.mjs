#!/usr/bin/env node
/** @independent-input DATABASE_URL — queries every declared launch-owed table under verified bypass. */
/**
 * verify-no-posting-gate-on-empty-table.mjs — EMPTY-POSTING-GATE-CLASS guard (CC-2)
 *
 * docs/lockdown/EMPTY-POSTING-GATE-CLASS-2026-08-28.md: "Same shape as ACCT-F5692
 * missing_pod_evidence — fail-closed poster returns a gate string; Chrome walk PASSes; GL does
 * not move." A table that gates a poster/match/recon/factoring-submit/loan/detention/POD/Faro-
 * import/tax-doc/RP-schedule path but holds 0 USMCA rows means that entire path is silently
 * inert — the UI can look complete while nothing can ever post through it.
 *
 * docs/lockdown/OWNER-NEVER-IDLE-SEED-EVERY-TABLE-2026-08-27.md §3: "CC-2 extends
 * docs/specs/scoreboard/posting-gate-tables.json by tracing posters." This guard reads that
 * registry and fails when any table with launch_owed: true has 0 USMCA rows — lucia bypass
 * (a plain SELECT COUNT(*) on a FORCE-RLS table would report 0 for the wrong reason) plus a
 * completeness discriminator (current_user asserted in the same transaction) so a masked-RLS
 * zero is never mistaken for a genuine empty table, per this session's own "an empty result is
 * an instrument claim" standard.
 *
 *   node scripts/verify-no-posting-gate-on-empty-table.mjs
 *   node scripts/verify-no-posting-gate-on-empty-table.mjs --selftest
 *
 * 443.101 — NEVER SEEDED, ALWAYS PROVEN. The 2026-08-27 "seed a labeled TEST row" order is superseded
 * by owner law 2026-09-02 (no test / sample fixtures in USMCA) and owner law 2026-10-04 (coders never
 * feed data). Every launch_owed entry names its engine `writer` ({file, symbol[, route]}) and a
 * `proof_test` — a real-Postgres backend test that drives that writer on an isolated company. This guard
 * proves each entry STATICALLY (checkProof: the test exists in the backend vitest set, imports the writer
 * symbol from the writer file and calls it, never INSERTs into the gated table itself, never names USMCA,
 * runs on an isolated company; the writer file INSERTs into the table) and then reads the live USMCA count:
 * a table with rows passes; an EMPTY table passes only on its verified proof (named as EMPTY LIVE, PROVEN
 * BY ...); an entry without a valid proof FAILS whatever the count. Read-only — never inserts/updates a row.
 * No DATABASE_URL / unreachable DB = FAIL (ROUND 29.9-B).
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
export const REQUIRES_LIVE_DB =
  "live-data guard; fails closed with no DATABASE_URL or an unreachable database (ROUND 29.9-B, E7 batch 2b)";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const REGISTRY_PATH = "docs/specs/scoreboard/posting-gate-tables.json";

export function loadLaunchOwedTables(registry) {
  const tables = Array.isArray(registry?.tables) ? registry.tables : [];
  return tables.filter((t) => t && t.launch_owed === true && typeof t.table === "string" && t.table.trim());
}

function qualifiedTableRegex(table) {
  // "schema.table" -> schema and table identifiers, each a plain word (no injection surface —
  // values come from the checked-in JSON registry, never user input, but validate the shape
  // anyway before interpolating into SQL).
  const m = /^([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)$/.exec(table);
  return m ? { schema: m[1], table: m[2] } : null;
}

function readRel(rel) {
  try {
    return fs.readFileSync(path.join(root, rel), "utf8");
  } catch {
    return null;
  }
}

const escapeRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Static proof of one launch_owed entry. `read(rel)` returns a repo file's text or null (injectable for the selftest).
 * Returns the list of problems; [] = proven.
 */
export function checkProof(entry, read = readRel) {
  const problems = [];
  const w = entry?.writer;
  const t = entry?.proof_test;
  if (!w || typeof w.file !== "string" || typeof w.symbol !== "string") problems.push("no engine `writer` {file, symbol} named");
  if (typeof t !== "string" || !t) problems.push("no `proof_test` named");
  if (problems.length) return problems;
  if (!/^apps\/backend\/src\/.+\.test\.ts$/.test(t)) problems.push(`proof_test ${t} is not in the backend vitest set (apps/backend/src/**/*.test.ts)`);
  const writerSrc = read(w.file);
  const testSrc = read(t);
  if (writerSrc == null) problems.push(`writer file ${w.file} does not exist`);
  if (testSrc == null) problems.push(`proof_test ${t} does not exist`);
  if (writerSrc == null || testSrc == null) return problems;

  const tableRe = new RegExp(`INSERT\\s+INTO\\s+${escapeRe(entry.table)}\\b`, "i");
  if (!tableRe.test(writerSrc)) problems.push(`writer ${w.file} never INSERTs INTO ${entry.table}`);
  if (!new RegExp(`export\\s+(?:async\\s+)?function\\s+${escapeRe(w.symbol)}\\b`).test(writerSrc)) problems.push(`writer ${w.file} does not export ${w.symbol}`);
  if (w.route && !writerSrc.includes(w.route)) problems.push(`writer ${w.file} does not mount ${w.route}`);

  // The test imports the symbol FROM the writer file (relative .js specifier resolving to the .ts writer).
  const importRe = new RegExp(`import\\s*\\{[^}]*\\b${escapeRe(w.symbol)}\\b[^}]*\\}\\s*from\\s*["']([^"']+)["']`, "g");
  let importsWriter = false;
  for (const m of testSrc.matchAll(importRe)) {
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(t), m[1])).replace(/\.js$/, ".ts");
    if (resolved === w.file) importsWriter = true;
  }
  if (!importsWriter) problems.push(`proof_test ${t} does not import ${w.symbol} from ${w.file}`);
  const callRe = w.route
    ? new RegExp(`(?:${escapeRe(w.symbol)}\\s*\\(|${escapeRe(w.symbol)}\\)[\\s\\S]*${escapeRe(w.route)})`)
    : new RegExp(`(?<!import[^\\n]*)\\b${escapeRe(w.symbol)}\\s*\\(`);
  if (!callRe.test(testSrc) || (w.route && !testSrc.includes(w.route))) problems.push(`proof_test ${t} never drives ${w.symbol}${w.route ? ` / ${w.route}` : ""}`);
  if (tableRe.test(testSrc)) problems.push(`proof_test ${t} INSERTs INTO ${entry.table} itself — a seeded row is not a proof of the writer`);
  if (/['"`]USMCA['"`]/.test(testSrc)) problems.push(`proof_test ${t} names USMCA — proofs run on an isolated company only (owner law 2026-09-02)`);
  if (!/createIsolatedOperatingCompany\s*\(/.test(testSrc)) problems.push(`proof_test ${t} does not run on an isolated company (createIsolatedOperatingCompany)`);
  return problems;
}

async function main() {
  const registryFile = path.join(root, REGISTRY_PATH);
  const registry = JSON.parse(fs.readFileSync(registryFile, "utf8"));
  const owedTables = loadLaunchOwedTables(registry);

  if (owedTables.length === 0) {
    console.log(`[posting-gate] PASS — 0 launch_owed tables declared in ${REGISTRY_PATH} (nothing to check)`);
    process.exit(0);
  }

  const unproven = owedTables
    .map((entry) => ({ table: entry.table, problems: checkProof(entry) }))
    .filter((r) => r.problems.length > 0);
  if (unproven.length > 0) {
    console.error(`[posting-gate] FAIL — ${unproven.length} launch_owed table(s) without a valid engine proof (443.101):`);
    for (const u of unproven) for (const p of u.problems) console.error(`  ${u.table}: ${p}`);
    process.exit(1);
  }

  const cs = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!cs) {
    console.error("verify-no-posting-gate-on-empty-table: FAIL — DATABASE_URL not set or the database is unreachable. A live money guard that cannot connect is a FAIL, never a pass (ROUND 29.9-B).");
    process.exit(1);
  }

  const pg = (await import("pg")).default;
  const pool = new pg.Pool({ connectionString: cs, max: 2 });

  try {
    const client = await pool.connect();
    const violations = [];
    const malformed = [];
    const provenEmpty = [];
    const live = [];
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL app.bypass_rls = 'lucia'");

      // Completeness discriminator: assert we are actually inside the bypass, in this same
      // transaction, before trusting any 0-count below — "THE BYPASS IS NOT PROOF" applies to
      // AND-gated policies, so a wrong role/GUC state must fail loud, not report a false empty.
      const who = await client.query("SELECT current_user AS u, current_setting('app.bypass_rls', true) AS b");
      const bypassActive = who.rows[0]?.b === "lucia";
      if (!bypassActive) {
        throw new Error(
          `completeness discriminator failed: app.bypass_rls did not read back as 'lucia' (current_user=${who.rows[0]?.u}) — refusing to trust any row count from this connection`
        );
      }

      const companyRes = await client.query("SELECT id::text AS id FROM org.companies WHERE code = 'USMCA' LIMIT 1");
      const usmcaId = companyRes.rows[0]?.id;
      if (!usmcaId) {
        throw new Error("completeness discriminator failed: org.companies has no row with code='USMCA' — cannot scope the check");
      }

      for (const entry of owedTables) {
        const q = qualifiedTableRegex(entry.table);
        if (!q) {
          malformed.push(entry.table);
          continue;
        }
        const existsRes = await client.query(
          `SELECT to_regclass($1) IS NOT NULL AS ok`,
          [`${q.schema}.${q.table}`]
        );
        if (!existsRes.rows[0]?.ok) {
          violations.push({ table: entry.table, reason: "table does not exist on this database", path: entry.path });
          continue;
        }
        const countRes = await client.query(
          `SELECT COUNT(*)::text AS n FROM ${q.schema}.${q.table} WHERE operating_company_id = $1::uuid`,
          [usmcaId]
        );
        const n = Number(countRes.rows[0]?.n ?? 0);
        if (n === 0) {
          // Every owed entry is statically proven above (unproven entries already FAILED), so an empty live table
          // is reported with its proof — never seeded (owner laws 2026-09-02 / 2026-10-04).
          provenEmpty.push({ table: entry.table, proof: entry.proof_test });
        } else {
          live.push({ table: entry.table, n });
        }
      }
      await client.query("ROLLBACK"); // read-only — never commit a write, there isn't one, but stay explicit.
    } finally {
      client.release();
    }

    if (malformed.length > 0) {
      console.error(`[posting-gate] FAIL — malformed table name(s) in ${REGISTRY_PATH} (expected "schema.table"): ${malformed.join(", ")}`);
      process.exit(1);
    }

    if (violations.length === 0) {
      for (const e of provenEmpty) console.log(`[posting-gate] EMPTY LIVE, PROVEN BY ${e.proof} — ${e.table} (0 USMCA rows; engine writer proven on an isolated company)`);
      console.log(`[posting-gate] PASS — ${owedTables.length} launch_owed table(s): ${live.length} hold USMCA rows, ${provenEmpty.length} empty and engine-proven; 0 unproven`);
      process.exit(0);
    }

    console.error(`\nEMPTY POSTING-GATE CLASS — ${violations.length} launch_owed table(s) still at 0 USMCA rows`);
    console.error("=".repeat(64));
    for (const v of violations) {
      console.error(`  ${v.table} (${v.path}) — ${v.reason}${v.triage ? ` [triage: ${v.triage}]` : ""}`);
    }
    console.error("=".repeat(64));
    console.error(`Never seed a TEST row (owner laws 2026-09-02 / 2026-10-04): restore the table / migration so the engine writer can write it.`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

function selftest() {
  const registryFile = path.join(root, REGISTRY_PATH);
  const text = fs.readFileSync(registryFile, "utf8");
  const registry = JSON.parse(text);

  const owed = loadLaunchOwedTables(registry);
  if (owed.length === 0) {
    console.error("FAIL(selftest): baseline registry has 0 launch_owed tables — nothing to plant an offender against");
    process.exit(1);
  }
  if (!owed.every((t) => qualifiedTableRegex(t.table))) {
    console.error("FAIL(selftest): a launch_owed table name in the registry does not parse as schema.table");
    process.exit(1);
  }

  // Offender: launch_owed table with a malformed name (no schema qualifier) must be caught by the
  // malformed-name path rather than silently skipped.
  const offenderRegistry = { ...registry, tables: [...registry.tables, { table: "not_qualified", launch_owed: true, path: "selftest" }] };
  const offenderOwed = loadLaunchOwedTables(offenderRegistry);
  const offenderMalformed = offenderOwed.filter((t) => !qualifiedTableRegex(t.table));
  if (offenderMalformed.length === 0) {
    console.error("FAIL(selftest): planted malformed table name was NOT flagged");
    process.exit(1);
  }

  // Offender: dropping launch_owed:true from every real entry must change the owed set (proves
  // the filter is load-bearing, not a no-op that would silently pass every table forever).
  const droppedRegistry = { ...registry, tables: registry.tables.map((t) => ({ ...t, launch_owed: false })) };
  const droppedOwed = loadLaunchOwedTables(droppedRegistry);
  if (droppedOwed.length !== 0) {
    console.error("FAIL(selftest): dropping launch_owed:true from every entry did not empty the owed set — filter is not load-bearing");
    process.exit(1);
  }

  // 443.101 proofs: every real owed entry is proven; each planted defect is caught.
  const realProblems = owed.flatMap((e) => checkProof(e).map((p) => `${e.table}: ${p}`));
  if (realProblems.length) {
    console.error(`FAIL(selftest): real registry entries are not proven:\n  ${realProblems.join("\n  ")}`);
    process.exit(1);
  }
  const base = owed.find((e) => !e.writer.route);
  const realTest = readRel(base.proof_test);
  const fakeRead = (over) => (rel) => (rel in over ? over[rel] : readRel(rel));
  const plants = [
    ["entry without proof_test on an empty table", checkProof({ ...base, proof_test: undefined })],
    ["proof_test that never calls the writer", checkProof(base, fakeRead({ [base.proof_test]: realTest.replace(new RegExp(`\\b${base.writer.symbol}\\s*\\(`, "g"), "noop(") }))],
    ["proof_test that does not import the writer", checkProof(base, fakeRead({ [base.proof_test]: realTest.replace(new RegExp(`import\\s*\\{[^}]*\\b${base.writer.symbol}\\b[^}]*\\}[^;]*;`), "") }))],
    ["proof_test that seeds the gated table directly", checkProof(base, fakeRead({ [base.proof_test]: `${realTest}\n// INSERT INTO ${base.table} (x) VALUES (1)` }))],
    ["proof_test that targets USMCA", checkProof(base, fakeRead({ [base.proof_test]: `${realTest}\nconst c = 'USMCA';` }))],
    ["proof_test not on an isolated company", checkProof(base, fakeRead({ [base.proof_test]: realTest.replaceAll("createIsolatedOperatingCompany", "getOperatingCompanyId") }))],
    ["writer that no longer writes the table", checkProof(base, fakeRead({ [base.writer.file]: readRel(base.writer.file).replace(new RegExp(`INSERT\\s+INTO\\s+${escapeRe(base.table)}`, "gi"), "SELECT 1 FROM x") }))],
    ["missing proof_test file", checkProof({ ...base, proof_test: "apps/backend/src/__nope__/missing.db.test.ts" })],
  ];
  const missed = plants.filter(([, problems]) => problems.length === 0).map(([name]) => name);
  if (missed.length) {
    console.error(`FAIL(selftest): planted proof defect(s) NOT caught: ${missed.join("; ")}`);
    process.exit(1);
  }

  console.log(`PASS(selftest): ${owed.length} launch_owed table(s) parse cleanly and are engine-proven; malformed-name, launch_owed-filter and ${plants.length} planted proof defects all caught`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  if (process.argv.includes("--selftest")) {
    selftest();
  } else {
    main().catch((e) => {
      console.error("[posting-gate] error:", e?.message ?? e);
      process.exit(1);
    });
  }
}
