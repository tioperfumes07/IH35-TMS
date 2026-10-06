#!/usr/bin/env node
/**
 * ROUND 433-CUR #3 / r392 — TILE_BUCKET_LIMIT on LedgerKpiPanel.
 *
 * Lead measured: git grep TILE_BUCKET_LIMIT on origin/main → nothing.
 * QBO-style banking KPI tiles show ONE number; buckets never render on the
 * tile face (they live in the drill modal). This guard pins the named
 * constant and that the tile render path respects TILE_BUCKET_LIMIT === 0.
 *
 * Usage:
 *   node scripts/verify-tile-bucket-limit.mjs
 *   node scripts/verify-tile-bucket-limit.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-tile-bucket-limit";
const PANEL = path.join(ROOT, "apps/frontend/src/components/shared/LedgerKpiPanel.tsx");

export function checkPanel(source) {
  const hasConst = /export\s+const\s+TILE_BUCKET_LIMIT\s*=\s*0\b/.test(source);
  const usesConst = /\bTILE_BUCKET_LIMIT\b/.test(source.replace(/export\s+const\s+TILE_BUCKET_LIMIT[\s\S]*?;/, ""));
  // Tile must not flatten buckets into the face (fmtBucket function is retired).
  const noFmtBucket = !/\bfunction\s+fmtBucket\b/.test(source) && !/\bconst\s+fmtBucket\b/.test(source);
  // Drill still renders buckets (breakdown table).
  const drillBuckets = /drillKpi\?\.buckets/.test(source) || /drillKpi\.buckets/.test(source);
  return { hasConst, usesConst, noFmtBucket, drillBuckets };
}

function selftest() {
  const ok = checkPanel(`
export const TILE_BUCKET_LIMIT = 0;
function bucketCount() { return TILE_BUCKET_LIMIT; }
{drillKpi?.buckets?.length ? <table/> : null}
`);
  const bad = checkPanel(`function fmtBucket(){} export const OTHER = 1;`);
  const fails = [];
  if (!ok.hasConst || !ok.usesConst || !ok.noFmtBucket || !ok.drillBuckets) fails.push("ok-source");
  // bad must fail closed: no TILE_BUCKET_LIMIT, and must detect function fmtBucket
  if (bad.hasConst || bad.usesConst || bad.noFmtBucket) fails.push("bad-source");
  if (fails.length) {
    console.error(`${LABEL} --selftest FAIL`, fails);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  if (!fs.existsSync(PANEL)) {
    console.error(`${LABEL} FAIL — missing ${path.relative(ROOT, PANEL)}`);
    process.exit(1);
  }
  const source = fs.readFileSync(PANEL, "utf8");
  const r = checkPanel(source);
  const problems = [];
  if (!r.hasConst) problems.push("LedgerKpiPanel must export const TILE_BUCKET_LIMIT = 0");
  if (!r.usesConst) problems.push("TILE_BUCKET_LIMIT must be referenced in panel logic (not dead export)");
  if (!r.noFmtBucket) problems.push("fmtBucket must stay retired — buckets do not flatten onto the tile");
  if (!r.drillBuckets) problems.push("drill modal must still render buckets (breakdown table)");
  if (problems.length) {
    console.error(`${LABEL} FAIL — ${problems.length} problem(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(
    `${LABEL} OK — TILE_BUCKET_LIMIT=0 exported+used; fmtBucket gone; drill buckets present (${path.relative(ROOT, PANEL)})`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
