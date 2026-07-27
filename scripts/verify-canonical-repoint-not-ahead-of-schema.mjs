#!/usr/bin/env node
/**
 * verify-canonical-repoint-not-ahead-of-schema
 *
 * THE DEFECT CLASS. A canonicalization sweep repoints code from a RETIRE table to its canonical
 * replacement, and the code merges while the migration that CREATES the canonical table is still
 * HELD awaiting the owner. From that moment the surface is dead in production: every query throws
 * 42P01 and the endpoint returns a raw 500. CI never sees it, because CI builds a fresh database
 * where every migration — including the held one — has run. Only prod, where held migrations wait,
 * has the shape where the table is absent.
 *
 * FOUND LIVE 2026-07-27 on br-fancy-credit-akjnd07a. SWEEP-C2 repointed
 * safety/position-history/position-history.routes.ts to maintenance.position_history and merged;
 * 202609020000_c2_maintenance_position_history_canonical.sql is in .held-migrations.json and absent
 * from the applied ledger. to_regclass('maintenance.position_history') IS NULL while the RETIRE
 * table maint.position_history still exists. All four Position History endpoints — a mounted,
 * reachable Safety tab (index.ts registers them; deployed build 9c09c8b carries them) — were
 * 42P01-ing. The GUARD work-order for this item predicted the opposite failure ("if not applied,
 * it's a live RETIRE write"); the repoint had in fact already happened, so the real failure was a
 * crash, not a stale write.
 *
 * WHAT THIS ASSERTS. For every table that a HELD migration creates, any route file that queries it
 * must guard on the table's existence and refuse honestly, rather than letting the query throw. The
 * rule is not "don't repoint early" — repointing early is fine and often necessary — it is "if you
 * reference a table your own held migration has not created yet, say so instead of 500-ing."
 *
 * Usage: node scripts/verify-canonical-repoint-not-ahead-of-schema.mjs [--selftest]
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const LABEL = "verify-canonical-repoint-not-ahead-of-schema";
const HELD_REGISTRY = "db/migrations/.held-migrations.json";
const ROUTE_DIRS = ["apps/backend/src"];

/**
 * Tables created by a migration that is still HELD. Parsed from the held registry + the migration
 * bodies, so the list follows reality instead of being re-typed here and drifting.
 */
export function tablesCreatedByHeldMigrations(heldFiles, readMigration) {
  const tables = new Map();
  for (const file of heldFiles) {
    const sql = readMigration(file);
    if (!sql) continue;
    const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_]+\.[a-z_]+)/gi;
    let m;
    while ((m = re.exec(sql)) !== null) tables.set(m[1].toLowerCase(), file);
  }
  return tables;
}

/** A file "guards" a table if it proves existence before querying and can refuse. */
export function fileGuardsTable(src, table) {
  const bare = table.split(".").pop();
  const provesExistence =
    new RegExp(`to_regclass\\([^)]*${table.replace(".", "\\.")}`, "i").test(src) ||
    new RegExp(`to_regclass\\(\\$\\d`, "i").test(src) ||
    (/information_schema\.(tables|columns)/i.test(src) &&
      new RegExp(`['"\`]${bare}['"\`]`, "i").test(src));
  // Proving existence is only half of it — the file must also be able to REFUSE.
  const canRefuse = /reply\.code\((?:501|503)\)/.test(src);
  return provesExistence && canRefuse;
}

export function findUnguardedReferences(heldTables, files) {
  const problems = [];
  for (const { path, src } of files) {
    for (const [table, migration] of heldTables) {
      const referenced = new RegExp(`(?:FROM|JOIN|INTO|UPDATE)\\s+${table.replace(".", "\\.")}\\b`, "i").test(src);
      if (!referenced) continue;
      if (!fileGuardsTable(src, table)) {
        problems.push(
          `${path} queries ${table}, but that table is only created by ${migration}, which is still HELD and unapplied on prod. Without an existence check the endpoint throws 42P01 and returns a 500 for the entire merge-to-apply window — invisible to CI, which runs every migration on a fresh database. Guard it and refuse with 503 naming the migration.`
        );
      }
    }
  }
  return problems;
}

function readHeldFiles() {
  const abs = resolve(ROOT, HELD_REGISTRY);
  if (!existsSync(abs)) return [];
  const reg = JSON.parse(readFileSync(abs, "utf8"));
  return (reg.held ?? []).map((e) => e.file).filter(Boolean);
}

function readMigration(file) {
  const abs = resolve(ROOT, "db/migrations", file);
  return existsSync(abs) ? readFileSync(abs, "utf8") : "";
}

function collectRouteFiles() {
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === "__tests__") continue;
        walk(full);
      } else if (e.name.endsWith(".test.ts") || e.name.endsWith(".spec.ts")) {
        // Tests run against a FRESH database where every migration — including the held one — has
        // been applied. A test querying such a table is correct by construction, so excluding them
        // removes a false positive rather than hiding a defect. Runtime code has no such guarantee.
        continue;
      } else if (e.name.endsWith(".ts")) {
        out.push({ path: full.replace(`${ROOT}/`, ""), src: readFileSync(full, "utf8") });
      }
    }
  };
  for (const d of ROUTE_DIRS) walk(resolve(ROOT, d));
  return out;
}

function run() {
  const heldTables = tablesCreatedByHeldMigrations(readHeldFiles(), readMigration);
  const problems = findUnguardedReferences(heldTables, collectRouteFiles());
  if (problems.length) {
    console.error(`[${LABEL}] FAILED — ${problems.length} issue(s):`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    return false;
  }
  console.log(
    `[${LABEL}] OK — ${heldTables.size} table(s) created by held migrations; every code reference to them proves existence and can refuse honestly instead of 42P01-ing`
  );
  return true;
}

/**
 * Call sites this guard is knowingly RED on. EMPTY as of 2026-07-28 — and that is the ratchet working,
 * not the list being abandoned.
 *
 * It held three entries (the parts-inventory and safety-fine posters, and the catalogs account-merge
 * service). All three are now clear, for two independent reasons verified live rather than assumed:
 * Cursor's #3667/#3668/#3671 added their fail-closed checks, AND #3670 moved the four migrations
 * applied on 2026-07-27 from held[] to applied_held[], so the tables they create are no longer
 * "created only by a still-HELD migration" at all.
 *
 * The selftest below is what forced this edit: it asserts every KNOWN_RED entry is STILL DETECTED, so
 * the moment a site was fixed the build failed until the name was struck off. That is the inverse of
 * an allowlist — an allowlist never has to change; this one cannot stay stale.
 */
export const KNOWN_RED = [];

function selftest() {
  let ok = true;

  // The detector must still see every known-red site. A shrinking set means someone fixed one (good
  // — update this list) or the detector silently stopped working (bad). Either way it must be noticed.
  const heldNow = tablesCreatedByHeldMigrations(readHeldFiles(), readMigration);
  const flaggedPaths = new Set(
    findUnguardedReferences(heldNow, collectRouteFiles()).map((p) => p.split(" queries ")[0])
  );
  if (KNOWN_RED.length === 0) {
    console.log("SELFTEST: KNOWN_RED is empty — no knowingly-red sites remain; the fixture cases below still prove the detector works");
  }
  for (const path of KNOWN_RED) {
    if (!flaggedPaths.has(path)) {
      console.error(
        `SELFTEST FAIL: ${path} is no longer flagged. If it was fixed, remove it from KNOWN_RED; if the detector broke, fix the detector. Do not leave this ambiguous.`
      );
      ok = false;
    } else {
      console.log(`SELFTEST: known-red site still detected — ${path}`);
    }
  }

  // The site this lane DID fix must NOT be flagged, or the fix is not real.
  const fixed = "apps/backend/src/safety/position-history/position-history.routes.ts";
  if (flaggedPaths.has(fixed)) {
    console.error(`SELFTEST FAIL: ${fixed} is still flagged — the readiness guard added there is not effective`);
    ok = false;
  } else {
    console.log(`SELFTEST: position-history is guarded and no longer flagged — OK`);
  }

  const heldTables = new Map([["maintenance.position_history", "202609020000_c2.sql"]]);

  const cases = [
    [
      "unguarded reference (the real 2026-07-27 defect)",
      [{ path: "fixture.ts", src: `const r = await client.query("SELECT * FROM maintenance.position_history ph");` }],
      true,
    ],
    [
      "guarded + can refuse",
      [
        {
          path: "fixture.ts",
          src: `await client.query("SELECT to_regclass($1) IS NOT NULL AS present", [t]);\nif (!ok) return reply.code(503).send({});\nconst r = await client.query("SELECT * FROM maintenance.position_history ph");`,
        },
      ],
      false,
    ],
    [
      "proves existence but cannot refuse — silently degrades instead of saying why",
      [
        {
          path: "fixture.ts",
          src: `await client.query("SELECT to_regclass($1) IS NOT NULL AS present", [t]);\nif (!ok) return { rows: [] };\nconst r = await client.query("SELECT * FROM maintenance.position_history ph");`,
        },
      ],
      true,
    ],
    ["no reference at all", [{ path: "fixture.ts", src: `SELECT 1` }], false],
  ];

  for (const [name, files, shouldFlag] of cases) {
    const flagged = findUnguardedReferences(heldTables, files).length > 0;
    if (flagged !== shouldFlag) {
      console.error(`SELFTEST FAIL: '${name}' expected flagged=${shouldFlag}, got ${flagged}`);
      ok = false;
    } else {
      console.log(`SELFTEST: '${name}' -> flagged=${flagged} as expected`);
    }
  }

  // The real route must be flagged if its guard is removed — proves this guard protects that file.
  const realPath = "apps/backend/src/safety/position-history/position-history.routes.ts";
  const realAbs = resolve(ROOT, realPath);
  if (existsSync(realAbs)) {
    const real = readFileSync(realAbs, "utf8");
    const stripped = real.replace(/to_regclass/g, "no_such_fn").replace(/reply\.code\(503\)/g, "reply.code(200)");
    if (stripped === real) {
      console.error("SELFTEST FAIL: could not mutate the real route — the case proves nothing");
      ok = false;
    } else if (!findUnguardedReferences(heldTables, [{ path: realPath, src: stripped }]).length) {
      console.error("SELFTEST FAIL: removing the guard from the real route was not caught");
      ok = false;
    } else {
      console.log("SELFTEST: removing the guard from the real position-history route -> caught");
    }
  }

  if (!ok) process.exit(1);
  console.log(`[${LABEL}] SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else process.exit(run() ? 0 : 1);
