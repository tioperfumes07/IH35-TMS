#!/usr/bin/env node
// ROUND 288.3 item 1 / ROUND 296 3 (CC-1) — IFTA MILES ARE GPS-APPORTIONED. Both IFTA screens summed each load's FULL
// miles once in EVERY state it stopped in (load_stops fallback) — an overstated per-state fuel-tax liability. Fails if:
//   1. aggregateStateMiles stops taking miles from computeIftaMiles (the GPS engine) or regains a fallback;
//   2. ANY IFTA surface (apps/backend/src/ifta, apps/backend/src/reports/ifta) sums load miles per state — a load
//      miles column (miles_practical / miles_shortest / loaded_miles) read alongside mdata.load_stops.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-ifta-apportioned-miles";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AGG = "apps/backend/src/ifta/ifta-state-miles-aggregator.ts";
const DIRS = ["apps/backend/src/ifta", "apps/backend/src/reports/ifta"];

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) { if (e !== "__tests__") walk(p, out); }
    else if (/\.ts$/.test(e) && !/\.test\.ts$/.test(e)) out.push(p);
  }
  return out;
}

export function problems(files) {
  const p = [];
  const agg = files[AGG] ?? "";
  if (!/await computeIftaMiles\(/.test(agg) || !/linked_unit_miles/.test(agg)) p.push("aggregateStateMiles must take IFTA miles from computeIftaMiles (GPS apportionment, linked units)");
  if (/load_stops_fallback|samsara\.vehicle_state_miles/.test(agg)) p.push("aggregateStateMiles regained a non-GPS miles path");
  for (const [rel, src] of Object.entries(files)) {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    if (/mdata\.load_stops/.test(code) && /\b(miles_practical|miles_shortest|loaded_miles)\b/.test(code)) p.push(`${rel} sums load miles per stop state (double counts every multi-state load)`);
  }
  return p;
}

function load() {
  const out = {};
  for (const d of DIRS) for (const f of walk(path.join(ROOT, d))) out[path.relative(ROOT, f)] = readFileSync(f, "utf8");
  return out;
}

export function run() {
  return problems(load());
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const files = load();
  const own = problems(files);
  if (process.argv.includes("--selftest")) {
    if (own.length) { console.error(`${LABEL} --selftest FAIL on the real tree — ${own.join("; ")}`); process.exit(1); }
    const plants = [
      ["load-stop fallback back", { ...files, [AGG]: files[AGG] + "\nconst q = `SELECT SUM(l.miles_practical) FROM mdata.load_stops ls JOIN mdata.loads l ON l.id = ls.load_id`;" }],
      ["engine bypassed", { ...files, [AGG]: files[AGG].replace("await computeIftaMiles(", "await other(") }],
    ];
    for (const [name, planted] of plants) {
      if (!problems(planted).length) { console.error(`${LABEL} --selftest FAIL — plant "${name}" not caught`); process.exit(1); }
    }
    console.log(`${LABEL} --selftest PASS (real tree clean; ${plants.length}/${plants.length} plants caught)`);
    process.exit(0);
  }
  if (own.length) { console.error(`${LABEL}: FAIL — ${own.join("; ")}`); process.exit(1); }
  console.log(`${LABEL}: OK — every IFTA surface reads GPS-apportioned miles (computeIftaMiles); no per-state load-miles sum.`);
}
