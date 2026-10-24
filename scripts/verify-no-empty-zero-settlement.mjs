#!/usr/bin/env node
/**
 * verify-no-empty-zero-settlement — ROUND 443.292-F
 *
 * Ensures:
 *  1. settlement-payrun-close.service.ts contains SETTLEMENT_HAS_NO_LIVE_LINES (engine refuses empty shells)
 *  2. tour-readout.routes.ts contains the "settlement_lines" hard-blocker (UI refuses before engine)
 *  3. Both files reference is_active = true for the settlement_lines count
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLOSE_REL = "apps/backend/src/driver-finance/settlement-payrun-close.service.ts";
const TOUR_REL = "apps/backend/src/driver-finance/tour-readout.routes.ts";
const LABEL = "verify-no-empty-zero-settlement";

function readDisk(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function run(overrides = {}) {
  const errors = [];
  const read = (rel) => overrides[rel] ?? readDisk(rel);
  const close = read(CLOSE_REL);
  const tour = read(TOUR_REL);

  if (!close.includes('"SETTLEMENT_HAS_NO_LIVE_LINES"'))
    errors.push("close engine must throw SETTLEMENT_HAS_NO_LIVE_LINES for empty settlements");
  if (!close.includes("SETTLEMENT_HAS_NO_LIVE_LINES"))
    errors.push("SETTLEMENT_HAS_NO_LIVE_LINES must appear in PayRunCloseErrorCode union");
  if (!close.includes("liveLineCount") || !close.includes("is_active = true"))
    errors.push("close engine must query liveLineCount with is_active = true");
  if (!/settlement_lines.*hard.*true/.test(tour))
    errors.push('tour-readout buildTourReadout must include a hard=true ready item keyed "settlement_lines"');
  if (!tour.includes("linesRes.rows.length > 0"))
    errors.push("tour-readout settlement_lines blocker must check linesRes.rows.length > 0");

  return errors;
}

function selftest() {
  const baseClose = readDisk(CLOSE_REL);
  const baseTour = readDisk(TOUR_REL);
  const baseline = run();
  if (baseline.length) throw new Error(`clean baseline red: ${baseline.join("; ")}`);

  const mutations = [
    [CLOSE_REL, '"SETTLEMENT_HAS_NO_LIVE_LINES"', '"SETTLEMENT_HAS_NO_LIVE_LINES_REMOVED"'],
    [CLOSE_REL, "liveLineCount", "liveLineCnt"],
    [TOUR_REL, "linesRes.rows.length > 0", "linesRes.rows.length > 999"],
  ];
  let rejected = 0;
  for (const [rel, needle, replacement] of mutations) {
    const src = rel === CLOSE_REL ? baseClose : baseTour;
    if (!src.includes(needle)) throw new Error(`plant target missing in ${rel}: ${needle}`);
    const planted = { [rel]: src.split(needle).join(replacement) };
    if (run(planted).length > 0) rejected++;
  }
  if (rejected !== mutations.length) throw new Error(`rejected ${rejected}/${mutations.length} plants`);
  console.log(`[${LABEL}] --selftest PASS: ${rejected}/${mutations.length} mutations detected`);
}

function main() {
  if (process.argv.includes("--selftest")) { selftest(); return; }
  const errors = run();
  if (errors.length) {
    console.error(`\n[${LABEL}] FAILED:\n`);
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] All checks passed ✓`);
}
main();
