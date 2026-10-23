#!/usr/bin/env node
// LEAD 443.260.5 (c) (CC-2): a settlement header's load boundaries are written WHOLE or not at all.
// RULE 1: every SQL UPDATE of driver_finance.driver_settlements that assigns first_load_id (or last_load_id) also
//         assigns first_load_number (or last_load_number) in the same SET — ids and numbers never drift apart.
// RULE 2: no incremental boundary write — `first_load_id = COALESCE(first_load_id, …)` / `last_load_id = <a joining load>`
//         outside THE engine (apps/backend/src/driver-finance/settlement-boundaries.service.ts) and the shared rollup's
//         fill-only backfill (settlements-load-bookended.service.ts, which also writes the numbers).
// Why (measured on prod 10-23): repairReassignedPresettlementBoundaries rewrote first/last_load_id alone and the
// pre-settlement link set first_load_id = COALESCE(first_load_id, <joining load>) / last_load_id = <joining load>:
// 5 settlements read first_load_id = last_load_id while their own numbers and lines named 2–3 loads.
//   node scripts/verify-settlement-boundary-writers.mjs [--selftest]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-settlement-boundary-writers";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "apps/backend/src");
const COALESCE_ALLOWED = new Set([
  "apps/backend/src/driver-finance/settlement-boundaries.service.ts",
  "apps/backend/src/driver-finance/settlements-load-bookended.service.ts",
]);
const UPDATE_RE = /UPDATE\s+driver_finance\.driver_settlements\b(?:\s+(?!SET\b)\w+)?\s+SET\b([\s\S]*?)(?:\bWHERE\b|\bFROM\b|\bRETURNING\b|`)/g;

export function boundaryWriteProblems(rel, text) {
  const out = [];
  for (const m of text.matchAll(UPDATE_RE)) {
    const set = m[1];
    const line = text.slice(0, m.index).split("\n").length;
    for (const side of ["first", "last"]) {
      const idSet = new RegExp(`\\b${side}_load_id\\s*=`).test(set);
      const noSet = new RegExp(`\\b${side}_load_number\\s*=`).test(set);
      if (idSet && !noSet) out.push(`RULE 1 ${rel}:${line} sets ${side}_load_id without ${side}_load_number — write the boundary through rederiveSettlementBoundariesInClientTx`);
      if (idSet && !COALESCE_ALLOWED.has(rel) && new RegExp(`\\b${side}_load_id\\s*=\\s*COALESCE\\s*\\(\\s*(?:\\w+\\.)?${side}_load_id\\b`, "i").test(set)) {
        out.push(`RULE 2 ${rel}:${line} keeps ${side}_load_id by increment (COALESCE) — derive it from the settlement's own lines (rederiveSettlementBoundariesInClientTx)`);
      }
    }
  }
  return out;
}

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "__tests__" && e.name !== "node_modules") walk(p, acc); }
    else if (/\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name)) acc.push(p);
  }
  return acc;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    const q = (sql) => "await client.query(`" + sql + "`, []);";
    const cases = [
      ["the old pre-settlement link (COALESCE + id only) fails", boundaryWriteProblems("apps/backend/src/x.ts", q("UPDATE driver_finance.driver_settlements SET first_load_id = COALESCE(first_load_id, $1::uuid), last_load_id = $1::uuid, updated_at = now() WHERE id = $2")).length === 3],
      ["the old repair (ids alone) fails", boundaryWriteProblems("apps/backend/src/x.ts", q("UPDATE driver_finance.driver_settlements s SET first_load_id = b.ids[1], last_load_id = b.ids[2], updated_at = now() FROM stale old")).length === 2],
      ["ids + numbers together pass", boundaryWriteProblems("apps/backend/src/x.ts", q("UPDATE driver_finance.driver_settlements SET first_load_id = $3::uuid, last_load_id = $4::uuid, first_load_number = $5, last_load_number = $6 WHERE id = $1")).length === 0],
      ["last side alone with its number passes", boundaryWriteProblems("apps/backend/src/x.ts", q("UPDATE driver_finance.driver_settlements SET last_load_id = $2, last_load_number = $3 WHERE id = $1")).length === 0],
      ["the rollup's fill-only COALESCE with numbers passes in its own file", boundaryWriteProblems("apps/backend/src/driver-finance/settlements-load-bookended.service.ts", q("UPDATE driver_finance.driver_settlements s SET first_load_id = COALESCE(s.first_load_id, b.first_id), first_load_number = COALESCE(s.first_load_number, b.first_no), last_load_id = COALESCE(s.last_load_id, b.last_id), last_load_number = COALESCE(s.last_load_number, b.last_no) FROM bounds b")).length === 0],
      ["the same COALESCE elsewhere fails RULE 2", boundaryWriteProblems("apps/backend/src/y.ts", q("UPDATE driver_finance.driver_settlements s SET first_load_id = COALESCE(s.first_load_id, $2), first_load_number = COALESCE(s.first_load_number, $3) WHERE id = $1")).length === 1],
      ["an UPDATE that does not touch boundaries passes", boundaryWriteProblems("apps/backend/src/x.ts", q("UPDATE driver_finance.driver_settlements SET status = 'closed' WHERE id = $1")).length === 0],
    ];
    let bad = 0;
    for (const [n, pass] of cases) { console.log(`  ${pass ? "✓" : "✗"} ${n}`); if (!pass) bad++; }
    console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
    process.exit(bad ? 1 : 0);
  }
  const files = walk(SRC);
  const problems = [];
  let writers = 0;
  for (const f of files) {
    const rel = path.relative(ROOT, f).split(path.sep).join("/");
    const text = fs.readFileSync(f, "utf8");
    for (const m of text.matchAll(UPDATE_RE)) if (/\b(first|last)_load_id\s*=/.test(m[1])) writers++;
    problems.push(...boundaryWriteProblems(rel, text));
  }
  if (writers === 0) { console.error(`${LABEL}: FAIL — 0 boundary writers found under apps/backend/src (the scan is blind)`); process.exit(1); }
  if (problems.length) { console.error(`${LABEL}: FAIL\n  ${problems.join("\n  ")}`); process.exit(1); }
  console.log(`${LABEL}: OK — ${writers} settlement boundary write(s) under apps/backend/src, every one writes ids with their numbers.`);
}
