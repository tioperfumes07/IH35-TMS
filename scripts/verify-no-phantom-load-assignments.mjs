#!/usr/bin/env node
/**
 * verify-no-phantom-load-assignments (DISP-PHANTOM-CLASS)
 *
 * THE DEFECT. `mdata.load_assignments` does not exist — to_regclass IS NULL, verified on
 * br-fancy-credit-akjnd07a 2026-07-27. Neither do `mdata.loads.uuid` (the PK is `id`) or
 * `mdata.loads.delivered_at` (delivery time lives on the stop: mdata.load_stops.actual_departure_at).
 * Code referencing any of them throws 42P01/42703 the moment it runs.
 *
 * WHERE IT BIT. integrations/samsara/geofences/reconciliation.service.ts joined the phantom table in
 * its anomaly-4 query, gated only by a `mdata.loads` existence check that is always TRUE. So it ran
 * on every daily reconciliation and threw — and because the throw escaped BEFORE the persist loop,
 * anomalies 1-3 were computed and then discarded. The daily geofence reconciliation was persisting
 * nothing at all, which is strictly worse than the missing anomaly it appeared to be.
 *
 * WHY A GUARD AND NOT JUST A FIX. This is a CLASS, not an incident: the same three identifiers were
 * copied into layover detection and (per the original work-order) suspected in border crossings. Two
 * of those turned out already fixed or never affected, but the identifiers are still the natural
 * thing to write, so the denial has to be mechanical.
 *
 * SCOPE NOTE. `dispatch.load_assignment_history` is REAL and canonical — it must not be confused with
 * the phantom, so the pattern is anchored to the `mdata.` schema qualifier. Likewise `X.uuid` and
 * `X.delivered_at` are only phantom when X aliases mdata.loads; a CTE that aliases
 * ls.actual_departure_at AS delivered_at is correct and must not be flagged (booking-gap.service.ts
 * does exactly that, and an earlier work-order wrongly called it a phantom).
 *
 * Usage: node scripts/verify-no-phantom-load-assignments.mjs [--selftest]
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const LABEL = "verify-no-phantom-load-assignments";
const SCAN_DIRS = ["apps/backend/src", "apps/frontend/src"];

export function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/^\s*--.*$/gm, " ");
}

export function phantomProblems(path, rawSrc) {
  const out = [];
  const src = stripComments(rawSrc);

  if (/\bmdata\.load_assignments\b/.test(src)) {
    out.push(
      `${path}: references mdata.load_assignments — that table DOES NOT EXIST (to_regclass IS NULL on prod). Resolve the unit via mdata.loads.assigned_unit_id and the driver via assigned_primary_driver_id. dispatch.load_assignment_history is the real, canonical history table and is a different thing.`
    );
  }

  // Only flag the SELECT of a phantom column, never an alias that CREATES the name from a real one.
  // `ls.actual_departure_at AS delivered_at` is the canonical pattern and must stay legal.
  const loadsAliases = new Set();
  for (const m of src.matchAll(/\bmdata\.loads\s+(?:AS\s+)?([a-z][a-z0-9_]*)/gi)) loadsAliases.add(m[1]);
  for (const alias of loadsAliases) {
    const uuidRef = new RegExp(`\\b${alias}\\.uuid\\b`);
    const deliveredRef = new RegExp(`\\b${alias}\\.delivered_at\\b`);
    const completedRef = new RegExp(`\\b${alias}\\.completed_at\\b`);
    if (uuidRef.test(src)) {
      out.push(`${path}: reads ${alias}.uuid where ${alias} aliases mdata.loads — the primary key column is id, so this throws 42703`);
    }
    if (deliveredRef.test(src)) {
      out.push(
        `${path}: reads ${alias}.delivered_at where ${alias} aliases mdata.loads — no such column. The delivery timestamp is the last stop_type='delivery' stop's actual_departure_at on mdata.load_stops.`
      );
    }
    if (completedRef.test(src)) {
      out.push(
        `${path}: reads ${alias}.completed_at where ${alias} aliases mdata.loads — no such column either (prod carries only created_at and updated_at). Use the delivery stop's actual_departure_at.`
      );
    }
  }

  return out;
}

function collectFiles() {
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
        if (e.name === "node_modules") continue;
        walk(full);
      } else if (/\.(ts|tsx)$/.test(e.name)) {
        out.push({ path: full.replace(`${ROOT}/`, ""), src: readFileSync(full, "utf8") });
      }
    }
  };
  for (const d of SCAN_DIRS) walk(resolve(ROOT, d));
  return out;
}

function run() {
  const files = collectFiles();
  const problems = files.flatMap(({ path, src }) => phantomProblems(path, src));
  if (problems.length) {
    console.error(`[${LABEL}] FAILED — ${problems.length} issue(s):`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    return false;
  }
  console.log(`[${LABEL}] OK — ${files.length} file(s) scanned; no reference to mdata.load_assignments, mdata.loads.uuid or mdata.loads.delivered_at`);
  return true;
}

function selftest() {
  let ok = true;

  if (!run()) {
    console.error("SELFTEST FAIL: the real tree is flagged — false positive");
    ok = false;
  }

  const cases = [
    ["the phantom table", `FROM mdata.loads l LEFT JOIN mdata.load_assignments la ON la.load_uuid = l.uuid`, true],
    ["phantom uuid on a loads alias", `SELECT l.uuid FROM mdata.loads l`, true],
    ["phantom delivered_at on a loads alias", `SELECT l.delivered_at FROM mdata.loads l WHERE 1=1`, true],
    ["phantom completed_at on a loads alias", `SELECT COALESCE(l.completed_at, l.created_at) FROM mdata.loads l`, true],
    [
      "canonical alias — MUST NOT be flagged (booking-gap pattern)",
      `SELECT ls.actual_departure_at AS delivered_at FROM mdata.loads l JOIN mdata.load_stops ls ON ls.load_id = l.id`,
      false,
    ],
    ["the REAL history table — MUST NOT be flagged", `JOIN dispatch.load_assignment_history lah ON lah.load_id = l.id`, false],
    ["uuid on an unrelated alias", `SELECT tmpl.uuid FROM accounting.bill_templates tmpl`, false],
    ["phantom named only in a comment", `-- we used to join mdata.load_assignments here\nSELECT l.id FROM mdata.loads l`, false],
  ];

  for (const [name, src, shouldFlag] of cases) {
    const flagged = phantomProblems("fixture.ts", src).length > 0;
    if (flagged !== shouldFlag) {
      console.error(`SELFTEST FAIL: '${name}' expected flagged=${shouldFlag}, got ${flagged}`);
      ok = false;
    } else {
      console.log(`SELFTEST: '${name}' -> flagged=${flagged} as expected`);
    }
  }

  // Re-plant the exact defect into the real repaired file — proves this guard protects THAT file.
  const target = "apps/backend/src/integrations/samsara/geofences/reconciliation.service.ts";
  const real = readFileSync(resolve(ROOT, target), "utf8");
  const reverted = real.replace(
    /FROM mdata\.loads l\n\s+JOIN mdata\.load_stops ls/,
    "FROM mdata.loads l\n         LEFT JOIN mdata.load_assignments la ON la.load_uuid = l.uuid\n         JOIN mdata.load_stops ls"
  );
  if (reverted === real) {
    console.error("SELFTEST FAIL: could not re-plant the defect into the real file — the case proves nothing");
    ok = false;
  } else if (!phantomProblems(target, reverted).length) {
    console.error("SELFTEST FAIL: re-planting mdata.load_assignments into the real file was not caught");
    ok = false;
  } else {
    console.log("SELFTEST: re-planting the phantom join into the repaired reconciliation service -> caught");
  }

  if (!ok) process.exit(1);
  console.log(`[${LABEL}] SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else process.exit(run() ? 0 : 1);
