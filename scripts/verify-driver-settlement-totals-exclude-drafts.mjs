#!/usr/bin/env node
// ROUND 297 driver-profile audit (CC-1) — the driver profile's settlement YTD / lifetime / last-4-weeks figures are
// SETTLED pay only. They excluded only cancelled / reversed rows, so an open settlement or a P-series pre-settlement
// draft counted as money paid (D1 $16,349.52 vs settled $14,503.41; D2 $8,082.75 vs $7,377.21). This guard fails if any
// of the three CTEs (ytd, lifetime, weeks) in driver-aggregate.service.ts stops excluding status 'open' and
// is_presettlement drafts.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-driver-settlement-totals-exclude-drafts";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/backend/src/mdata/driver-aggregate.service.ts";

export function problems(src) {
  const p = [];
  for (const cte of ["ytd", "lifetime", "weeks"]) {
    const m = src.match(new RegExp(`\\b${cte} AS \\(([\\s\\S]*?)\\n\\s*\\)`));
    if (!m) { p.push(`${FILE}: CTE ${cte} not found`); continue; }
    if (!/status NOT IN \('cancelled', 'open'\)/.test(m[1])) p.push(`${FILE}: ${cte} must exclude status 'open' (and 'cancelled')`);
    if (!/COALESCE\(is_presettlement, false\) = false/.test(m[1])) p.push(`${FILE}: ${cte} must exclude P-series pre-settlement drafts`);
  }
  return p;
}

export function run() {
  return problems(readFileSync(path.join(ROOT, FILE), "utf8"));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const src = readFileSync(path.join(ROOT, FILE), "utf8");
  const own = problems(src);
  if (process.argv.includes("--selftest")) {
    if (own.length) { console.error(`${LABEL} --selftest FAIL on the real tree — ${own.join("; ")}`); process.exit(1); }
    const plants = [
      ["open drafts back in YTD", src.replace("status NOT IN ('cancelled', 'open')", "status <> 'cancelled'")],
      ["presettlement back", src.replace("COALESCE(is_presettlement, false) = false", "true")],
    ];
    for (const [name, planted] of plants) {
      if (!problems(planted).length) { console.error(`${LABEL} --selftest FAIL — plant "${name}" not caught`); process.exit(1); }
    }
    console.log(`${LABEL} --selftest PASS (real tree clean; ${plants.length}/${plants.length} plants caught)`);
    process.exit(0);
  }
  if (own.length) { console.error(`${LABEL}: FAIL —\n  ${own.join("\n  ")}`); process.exit(1); }
  console.log(`${LABEL}: OK — driver YTD / lifetime / weeks count settled pay only (no open settlements, no P-series drafts).`);
}
