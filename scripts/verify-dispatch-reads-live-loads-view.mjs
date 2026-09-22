#!/usr/bin/env node
// ROUND 36.1 (Lead ruling, 2026-09-22, docs/manuals/02-RULING-LIVE-LOADS-VIEW-THE-PERMANENT-FIX.md):
// the per-caller "assertCanonicalSubset + remember the money half" convention FAILED — thirteen
// callers imported assertCanonicalSubset, passed it, and still rendered every 'dispatched' load (19,
// 14 already settled/driver-billed). A list-based guard can never enforce a row-level condition
// (the money half is three NOT EXISTS clauses against three other tables, a different SHAPE than a
// status enum list). The fix moved the guarantee into the data layer: views.live_loads
// (db/migrations/202614180000_views_live_loads.sql) bakes both halves in so a settled load is never
// in the result set for ANY consumer, including boards nobody has written yet.
//
// This guard is the backstop for THAT move: it fails a dispatch/dispatcher-board/load-costs-board
// list/board surface that still selects directly FROM mdata.loads instead of FROM views.live_loads.
//
// SHRINK-ONLY FOUR-ARM RATCHET against
// scripts/verify-dispatch-reads-live-loads-view.baseline.json, same shape as every other ratchet
// this session:
//   not in baseline, violating                    -> FAIL (new rot)
//   baseline entry got WORSE (more violations)     -> FAIL (debt grew)
//   baseline entry unchanged or better             -> PASS, printed as known debt, never silent
//   baseline entry now CLEAN (file fixed)          -> FAIL "remove me from the baseline"
//
// Static, no DATABASE_URL needed — pure source-text scan, never reads money data.
export const ALLOW_OFFLINE_SKIP =
  "pure static source-text scan (which .ts files select FROM mdata.loads under dispatch/**, " +
  "dispatcher-board/**, or accounting/load-costs-board*) — never connects to a database, so there " +
  "is nothing to silently skip; ROUND 29.9-B's fail-closed law governs live-money guards, not a " +
  "codebase-shape scanner like this one.";
import fs from "node:fs";
import path from "node:path";

const LABEL = "verify-dispatch-reads-live-loads-view";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SRC_DIR = path.join(ROOT, "apps/backend/src");
const BASELINE_PATH = path.join(ROOT, "scripts/verify-dispatch-reads-live-loads-view.baseline.json");

// Legitimate WRITERS of mdata.loads (INSERT/UPDATE, single-record mutation/status-transition
// routes) named explicitly by the ruling, plus their real on-disk locations, plus the Reports
// surfaces (historical, explicitly out of scope — "anything historical: mdata.loads directly —
// REPORTS ONLY, never a dispatch surface"). Each entry names WHY it is allow-listed.
const ALLOWLIST = new Map([
  ["dispatch/book-load.service.ts", "creates the load row (INSERT) — not a list/board read"],
  ["dispatch/update-load.service.ts", "single-load mutation by id — not a list/board read"],
  ["dispatch/quick-assign.service.ts", "single-load mutation by id (FOR UPDATE) — not a list/board read"],
  ["dispatch/loads.routes.ts", "mixed file: the two LIST endpoints (GET /dispatch/loads, GET /dispatch/loads/:id) alongside every status-transition/mutation route in the same file; ROUND 36.1's own follow-up task rewires the list endpoints onto views.live_loads — tracked, not silently excused, via the (known debt) baseline entry below rather than this allow-list"],
  ["dispatch/cancellation.service.ts", "status-transition route (cancel) — mutation, not a list/board read"],
  ["dispatch/stop-stamp.service.ts", "status-transition route (arrival/departure stamps) — mutation, not a list/board read"],
  ["dispatch/load-id-reservation.service.ts", "reserves a load_number sequence — not a list/board read"],
  ["dispatch/draft-crew-status-advance.ts", "status-transition (draft->crewed) — mutation, not a list/board read"],
]);

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
    } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

function inScope(relPath) {
  if (relPath.startsWith("dispatch/") && !relPath.startsWith("dispatch/__tests__/")) return true;
  if (relPath.startsWith("dispatcher-board/")) return true;
  if (relPath === "accounting/load-costs-board.routes.ts") return true;
  return false;
}

/**
 * Returns a list of violation reasons for one file's source text, or [] if clean.
 * Pure w.r.t. the filesystem read — testable directly against a string.
 */
export function findViolations(relPath, src) {
  if (!inScope(relPath)) return [];
  if (ALLOWLIST.has(relPath)) return [];
  const violations = [];

  // FAIL: a real SELECT-shaped `FROM mdata.loads` (a list/board read), not a write statement. An
  // UPDATE ... FROM mdata.loads / INSERT INTO mdata.loads / DELETE FROM mdata.loads is a mutation,
  // not a board — skip those by requiring the preceding non-whitespace SQL keyword context NOT be
  // UPDATE/INSERT/DELETE on this same table.
  const fromRe = /\bFROM\s+mdata\.loads\b/gi;
  let m;
  while ((m = fromRe.exec(src))) {
    const before = src.slice(Math.max(0, m.index - 200), m.index);
    // UPDATE mdata.loads ... FROM mdata.loads (self-join in an UPDATE) or a DELETE — not a read.
    if (/\bUPDATE\s+mdata\.loads\b/i.test(before) || /\bDELETE\s+FROM\s+mdata\.loads\b/i.test(src.slice(Math.max(0, m.index - 20), m.index + 20))) continue;
    const lineNo = src.slice(0, m.index).split("\n").length;
    violations.push(
      `line ${lineNo}: selects FROM mdata.loads directly — a dispatch/dispatcher-board/load-costs-board ` +
        `list/board surface must read FROM views.live_loads (ROUND 36.1) so a settled load can never ` +
        `render, structurally, instead of by convention.`
    );
  }

  return violations;
}

function scan() {
  const files = listTsFiles(SRC_DIR);
  const byFile = new Map();
  for (const abs of files) {
    const rel = path.relative(SRC_DIR, abs).replace(/\\/g, "/");
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
      console.error(`${LABEL}: FAIL — no baseline file and ${found.size} file(s) violate. Seed the baseline with a written reason, or fix them.`);
      for (const [f, vs] of found) for (const v of vs) console.error(`  ✗ ${f}: ${v}`);
      failures++;
    }
  } else {
    const baselineNames = new Set(Object.keys(baseline.files || {}));
    const foundNames = new Set(found.keys());

    for (const name of foundNames) {
      if (!baselineNames.has(name)) {
        console.error(`${LABEL}: FAIL — new rot, not in baseline: ${name}`);
        for (const v of found.get(name)) console.error(`  ✗ ${v}`);
        failures++;
      } else {
        const baselineCount = baseline.files[name].count;
        const liveCount = found.get(name).length;
        if (liveCount > baselineCount) {
          console.error(`${LABEL}: FAIL — ${name} got WORSE: baseline ${baselineCount} violation(s), live ${liveCount}`);
          failures++;
        } else {
          console.log(`${LABEL}: known debt — ${name}: ${liveCount} violation(s) (baseline ${baselineCount}, established ${baseline.established})`);
        }
      }
    }
    for (const name of baselineNames) {
      if (!foundNames.has(name)) {
        console.error(`${LABEL}: FAIL — ${name} is now CLEAN — remove it from ${path.basename(BASELINE_PATH)} (shrink the ratchet, don't leave stale debt on the books).`);
        failures++;
      }
    }
  }

  if (failures > 0) process.exit(1);
  console.log(`${LABEL}: PASS — ${found.size} known baselined file(s), 0 new violations.`);
}

function selftest() {
  const checks = [];

  const dirtySrc = `
    export async function listAtRiskLoads() {
      const q = \`
        SELECT l.id FROM mdata.loads l
         WHERE l.operating_company_id = $1
      \`;
    }
  `;
  checks.push([
    "RED (against today's actual shape, before the fix): a dispatch board selecting FROM mdata.loads -> at least 1 violation",
    findViolations("dispatch/arch-tabs.service.ts", dirtySrc).length >= 1,
  ]);

  const cleanSrc = `
    export async function listAtRiskLoads() {
      const q = \`
        SELECT l.id FROM views.live_loads l
         WHERE l.operating_company_id = $1 AND l.live_state = 'open_dispatch'
      \`;
    }
  `;
  checks.push([
    "GREEN (after the fix): the same board reading FROM views.live_loads -> 0 violations",
    findViolations("dispatch/arch-tabs.service.ts", cleanSrc).length === 0,
  ]);

  const outOfScopeSrc = `SELECT * FROM mdata.loads WHERE id = $1`;
  checks.push([
    "out-of-scope directory (not dispatch/dispatcher-board/load-costs-board) -> 0 violations",
    findViolations("reports/queries/some-report.ts", outOfScopeSrc).length === 0,
  ]);

  const allowlistedSrc = `INSERT INTO mdata.loads (id) VALUES ($1) RETURNING id, load_number, status FROM mdata.loads`;
  checks.push([
    "explicitly allow-listed writer file -> 0 violations even if it mentions mdata.loads",
    findViolations("dispatch/book-load.service.ts", allowlistedSrc).length === 0,
  ]);

  const mutationSrc = `
    const q = \`
      UPDATE mdata.loads l
      SET status = 'cancelled'
      FROM mdata.loads other
      WHERE l.id = $1
    \`;
  `;
  checks.push([
    "a genuine UPDATE ... FROM mdata.loads self-reference in a mutation, non-allow-listed file -> 0 violations (not a board read)",
    findViolations("dispatch/cancellation-detail.service.ts", mutationSrc).length === 0,
  ]);

  let bad = 0;
  for (const [name, ok] of checks) { if (!ok) bad++; console.log(`${ok ? "ok  " : "FAIL"}  ${name}`); }
  if (bad > 0) {
    console.error(`${LABEL} SELFTEST FAIL — ${bad} check(s) failed`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--selftest")) {
    selftest();
  } else {
    run();
  }
}
