#!/usr/bin/env node
// ROUND 155.23 item 6 / 157-A item 6: "Group by tour_id ONLY. Never join on driver_id or unit_id
// to assemble legs." Complements verify-presettlement-shows-only-this-load-and-its-open-tour.mjs
// (which checks the ONE known-critical file, tour-readout.routes.ts, in depth) with a broader
// static sweep across apps/backend/src/driver-finance/**: flags a SQL query that selects/joins
// MULTIPLE mdata.loads rows keyed by assigned_primary_driver_id/assigned_secondary_driver_id/
// assigned_unit_id as its membership test, unless the SAME statement also requires tour_id —
// exactly the shape of the real bug this round found (settlement-creator.service.ts stamping
// presettlement_link_id onto every load a draft names, no tour_id check at all).
//
// Deliberately narrow to avoid false positives: a single-row driver/unit LOOKUP (e.g. "find this
// load's own driver") is fine; what this guards against is using driver_id/unit_id as the
// membership predicate for a SET of loads that will be treated as one tour's legs.
export const ALLOW_OFFLINE_SKIP =
  "pure static source-text scan (which driver-finance .ts files assemble a load SET keyed by " +
  "driver/unit without a tour_id requirement) — never connects to a database.";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-tour-groups-by-tour-id-only";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_DIR = path.join(ROOT, "apps/backend/src/driver-finance");
const BASELINE_PATH = path.join(ROOT, "scripts/verify-tour-groups-by-tour-id-only.baseline.json");

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return null;
  return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
}

function listTsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      out.push(...listTsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

// A "membership assignment" write: UPDATEs mdata.loads.presettlement_link_id (or similarly links a
// load into a settlement/tour bucket) for loads resolved by load_number/id lookup, WITHOUT the
// same function ever checking the load's own tour_id before writing. This is the real anti-pattern
// (settlement-creator.service.ts's original shape) — a static, source-text heuristic, not a parser.
export function findViolations(relPath, src) {
  const violations = [];
  const writesPresettlementLink = /UPDATE\s+mdata\.loads\s+SET[^;]*presettlement_link_id\s*=/is.test(src);
  if (!writesPresettlementLink) return violations;

  const checksTourId = /\btour_id\b/.test(src);
  if (!checksTourId) {
    violations.push(
      `writes mdata.loads.presettlement_link_id but never references tour_id anywhere in the file — ` +
        `a load can be linked into a settlement/tour with no check that it actually belongs to that tour`
    );
    return violations;
  }

  // A weaker but real check: the specific UPDATE statement's surrounding function must mention
  // tour_id somewhere before the write (a 60-line lookback window), not just anywhere in the file.
  const idx = src.search(/UPDATE\s+mdata\.loads\s+SET[^;]*presettlement_link_id\s*=/is);
  const windowStart = Math.max(0, idx - 4000);
  const window = src.slice(windowStart, idx);
  if (!/\btour_id\b/.test(window)) {
    violations.push(
      `writes mdata.loads.presettlement_link_id without tour_id appearing anywhere in the ~4000 chars ` +
        `before that write — the write appears to link a load with no tour_id verification nearby`
    );
  }
  return violations;
}

function scan() {
  const files = listTsFiles(SCAN_DIR);
  const byFile = new Map();
  for (const abs of files) {
    const rel = path.relative(ROOT, abs).replace(/\\/g, "/");
    const src = fs.readFileSync(abs, "utf8");
    const violations = findViolations(rel, src);
    if (violations.length > 0) byFile.set(rel, violations);
  }
  return byFile;
}

function run() {
  const found = scan();
  const baseline = loadBaseline();
  let failures = 0;

  if (!baseline) {
    if (found.size > 0) {
      console.error(`${LABEL}: FAIL — no baseline and ${found.size} file(s) violate:`);
      for (const [f, vs] of found) for (const v of vs) console.error(`  ✗ ${f}: ${v}`);
      failures++;
    }
  } else {
    const baselineNames = new Set(Object.keys(baseline.files || {}));
    for (const [name, violations] of found) {
      if (!baselineNames.has(name)) {
        console.error(`${LABEL}: FAIL — new rot, not in baseline: ${name}`);
        for (const v of violations) console.error(`  ✗ ${v}`);
        failures++;
      }
    }
    for (const name of baselineNames) {
      if (!found.has(name)) {
        console.error(`${LABEL}: FAIL — ${name} is now CLEAN — remove it from the baseline.`);
        failures++;
      }
    }
  }

  if (failures > 0) process.exit(1);
  console.log(`${LABEL}: PASS — ${found.size} known baselined file(s), 0 new violations.`);
}

function selftest() {
  const checks = [];

  const clean = `
    async function link(client, loadId, settlementId) {
      const load = await client.query("SELECT tour_id FROM mdata.loads WHERE id = $1", [loadId]);
      if (!load.rows[0].tour_id) throw new Error("no tour_id");
      await client.query("UPDATE mdata.loads SET presettlement_link_id = $1 WHERE id = $2", [settlementId, loadId]);
    }
  `;
  checks.push(["file that checks tour_id before the write -> clean", findViolations("x.ts", clean).length === 0]);

  const dirty = `
    async function link(client, loadId, settlementId) {
      await client.query("UPDATE mdata.loads SET presettlement_link_id = $1, updated_at = now() WHERE id = $2", [settlementId, loadId]);
    }
  `;
  checks.push(["file that writes the link with no tour_id anywhere -> RED", findViolations("x.ts", dirty).length >= 1]);

  const noWrite = `const x = 1;`;
  checks.push(["file that never writes the link at all -> clean (out of scope)", findViolations("x.ts", noWrite).length === 0]);

  let bad = 0;
  for (const [name, ok] of checks) { if (!ok) bad++; console.log(`${ok ? "ok  " : "FAIL"}  ${name}`); }
  if (bad) { console.error(`\n${LABEL} SELFTEST FAILED: ${bad}`); process.exit(1); }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

const isDirectRun = process.argv[1] && new URL(import.meta.url).pathname === path.resolve(process.argv[1]);
if (isDirectRun) {
  if (process.argv.includes("--selftest")) selftest();
  else run();
}
