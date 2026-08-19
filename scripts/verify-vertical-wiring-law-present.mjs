#!/usr/bin/env node
/**
 * verify-vertical-wiring-law-present.mjs — LAW-2026-08-12-VERTICAL-WIRING.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-vertical-wiring-law-present";
const LAW = "docs/lockdown/VERTICAL-WIRING-LAW-2026-08-12.md";
const MUST_CITE = [
  "docs/lockdown/WIRE-FIRST-SPRINT-LAW-2026-08-12.md",
  "docs/specs/CODER-PASTE-INSTRUCTIONS-2026-08-12.md",
  "docs/specs/STANDING-SESSION-DIRECTIVE.md",
];
const VERTICAL_MARK =
  /VERTICAL-WIRING-LAW-2026-08-12|column-wave|CLASS-SWEEP|one matrix COLUMN ID|column id × all/i;

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/**
 * @param {Record<string, string>} overrides in-memory content overrides keyed by the MUST_CITE
 * relative path (or "docs/law/LAW.json") — lets the selftest exercise this against a planted-bad
 * fixture without writing to any real file on disk.
 */
export function findMissing(overrides = {}) {
  const missing = [];
  if (!fs.existsSync(path.join(ROOT, LAW))) missing.push(`${LAW} (missing file)`);
  for (const rel of MUST_CITE) {
    if (rel in overrides) {
      if (!VERTICAL_MARK.test(overrides[rel])) missing.push(`${rel} (does not cite vertical wiring law)`);
      continue;
    }
    if (!fs.existsSync(path.join(ROOT, rel))) {
      missing.push(`${rel} (missing file)`);
      continue;
    }
    if (!VERTICAL_MARK.test(read(rel))) missing.push(`${rel} (does not cite vertical wiring law)`);
  }
  const lawJson = overrides["docs/law/LAW.json"] ?? read("docs/law/LAW.json");
  if (!lawJson.includes("LAW-2026-08-12-VERTICAL-WIRING")) {
    missing.push("docs/law/LAW.json (LAW-2026-08-12-VERTICAL-WIRING not registered)");
  }
  return missing;
}

/**
 * Exercises the real findMissing() assertion — against the live repo tree, and against an
 * in-memory planted-bad fixture (one MUST_CITE file with its vertical-wiring citation stripped).
 * The prior version tested VERTICAL_MARK against a bare filename STRING (not file content), which
 * happened to pass only because the law's own name is embedded in that filename — it never called
 * findMissing() at all, so a real regression in file-existence/content/LAW.json checking would have
 * gone completely undetected.
 */
function selftest() {
  const real = findMissing();
  if (real.length) {
    console.error(`${LABEL} SELFTEST FAIL: real tree flagged: ${real.join("; ")}`);
    process.exit(1);
  }
  const target = MUST_CITE[0];
  const planted = findMissing({ [target]: "no mention of that law here" });
  if (!planted.some((m) => m.startsWith(target))) {
    console.error(`${LABEL} SELFTEST FAIL: missing-citation mutation on ${target} was NOT caught`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--selftest")) process.exit(selftest());
  const missing = findMissing();
  if (missing.length) {
    console.error(`${LABEL} FAIL:\n`);
    for (const m of missing) console.error(`  - ${m}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — vertical wiring law present and cited`);
}
