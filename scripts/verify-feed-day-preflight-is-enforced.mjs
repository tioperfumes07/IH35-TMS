#!/usr/bin/env node
// ROUND 131.3 (owner, via the Lead) — DAY-1 FEED GATE, the guard half.
//
// FAILS if any feed-day entry path can create a load without passing all five checks in
// apps/backend/src/feed/feed-day-preflight.service.ts's feedDayPreflight(). Two arms:
//   1. STRUCTURAL — the preflight service itself must genuinely carry all five checks, each with
//      a computed (not hard-coded) `passed` value. A guard that only checks "the file exists"
//      would pass on a stub that always opens.
//   2. ENFORCEMENT — every backend file that inserts a row into mdata.loads AND is plausibly part
//      of a feed-day load-creation path (lives under apps/backend/src/feed/**, or its own text
//      names "feed day" / "feedDay") must call feedDayPreflight(...) somewhere in that same file.
//      Today that set is empty (only the preflight service exists) — the guard passes vacuously
//      and stays armed for the first real feed-day loader.
//
// `node scripts/verify-feed-day-preflight-is-enforced.mjs`              check
// `node scripts/verify-feed-day-preflight-is-enforced.mjs --selftest`   self-check, no repo scan
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-feed-day-preflight-is-enforced";
const SERVICE_PATH = path.join(ROOT, "apps/backend/src/feed/feed-day-preflight.service.ts");
const SCAN_ROOT = path.join(ROOT, "apps/backend/src");

function fail(msg) {
  console.error(`${LABEL}: FAIL — ${msg}`);
  process.exit(1);
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(p, out);
      continue;
    }
    if (!/\.tsx?$/.test(entry.name)) continue;
    if (/\.test\.tsx?$/.test(entry.name)) continue;
    out.push(p);
  }
  return out;
}

/** Structural check on the preflight service's own source text — pure, takes a string. */
export function checkPreflightServiceStructure(source) {
  const problems = [];
  const checkNumbers = [1, 2, 3, 4, 5];
  for (const n of checkNumbers) {
    if (!new RegExp(`check:\\s*${n}\\b`).test(source)) {
      problems.push(`missing check: ${n}`);
    }
  }
  // A guard that always opens is theater. Every push site must compute `passed`, never hard-code
  // `passed: true,` — a real check's boolean comes from a comparison/condition, not a literal.
  if (/passed:\s*true\s*,/.test(source)) {
    problems.push('a check hard-codes "passed: true," — every check must compute its own pass/fail');
  }
  if (!/export\s+(async\s+)?function\s+feedDayPreflight/.test(source)) {
    problems.push("feedDayPreflight is not exported");
  }
  return problems;
}

/** Is this file plausibly a feed-day load-creation path? Pure — takes (relativePath, source). */
export function isFeedDayLoadCreator(relativePath, source) {
  const inFeedDir = relativePath.split(path.sep).includes("feed");
  const namesFeedDay = /feed[\s_-]?day/i.test(source);
  const insertsLoad = /INSERT\s+INTO\s+mdata\.loads/i.test(source);
  return { insertsLoad, isFeedDay: inFeedDir || namesFeedDay };
}

/** Full ENFORCEMENT scan over an arbitrary file list — pure, takes [{relativePath, source}]. */
export function scanForUnenforcedLoadCreators(files) {
  const violations = [];
  for (const { relativePath, source } of files) {
    const { insertsLoad, isFeedDay } = isFeedDayLoadCreator(relativePath, source);
    if (!insertsLoad || !isFeedDay) continue;
    if (relativePath.endsWith("feed-day-preflight.service.ts")) continue; // the preflight itself never inserts
    if (!/feedDayPreflight\s*\(/.test(source)) {
      violations.push(relativePath);
    }
  }
  return violations;
}

function selftest() {
  const failures = [];
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-day-preflight-selftest-"));
  try {
    // Structural arm — a stub that always opens must be caught.
    const stub = `export async function feedDayPreflight() { return { opened: true, checks: [
      { check: 1, label: "x", passed: true, measured: "n/a" },
    ] }; }`;
    const stubProblems = checkPreflightServiceStructure(stub);
    if (stubProblems.length === 0) failures.push("checkPreflightServiceStructure did not flag an always-open stub");

    const real = fs.readFileSync(SERVICE_PATH, "utf8");
    const realProblems = checkPreflightServiceStructure(real);
    if (realProblems.length !== 0) failures.push(`checkPreflightServiceStructure flagged the real service: ${realProblems.join("; ")}`);

    // Enforcement arm — a bad fixture (feed dir, inserts, never calls the preflight) must be
    // caught; a good fixture (same insert, but calls feedDayPreflight first) must not be.
    const badFile = { relativePath: path.join("apps/backend/src/feed", "bad-loader.ts"), source: `await client.query('INSERT INTO mdata.loads (id) VALUES ($1)', [id]);` };
    const goodFile = {
      relativePath: path.join("apps/backend/src/feed", "good-loader.ts"),
      source: `const result = await feedDayPreflight(userId, input);\n if (!result.opened) throw new Error('refused');\n await client.query('INSERT INTO mdata.loads (id) VALUES ($1)', [id]);`,
    };
    const unrelatedFile = { relativePath: path.join("apps/backend/src/dispatch", "unrelated.ts"), source: `await client.query('INSERT INTO mdata.loads (id) VALUES ($1)', [id]);` };

    const badViolations = scanForUnenforcedLoadCreators([badFile]);
    if (badViolations.length !== 1) failures.push(`scanForUnenforcedLoadCreators did not flag the bad fixture (got ${JSON.stringify(badViolations)})`);

    const goodViolations = scanForUnenforcedLoadCreators([goodFile]);
    if (goodViolations.length !== 0) failures.push(`scanForUnenforcedLoadCreators wrongly flagged the good fixture`);

    const unrelatedViolations = scanForUnenforcedLoadCreators([unrelatedFile]);
    if (unrelatedViolations.length !== 0) failures.push(`scanForUnenforcedLoadCreators flagged a load-inserter outside apps/backend/src/feed/** with no "feed day" naming — false positive`);

    if (failures.length) {
      for (const f of failures) console.error(`${LABEL} --selftest: FAIL — ${f}`);
      process.exit(1);
    }
    console.log(`${LABEL}: PASS --selftest`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  if (!fs.existsSync(SERVICE_PATH)) {
    fail(`${path.relative(ROOT, SERVICE_PATH)} does not exist`);
  }
  const serviceSource = fs.readFileSync(SERVICE_PATH, "utf8");
  const structuralProblems = checkPreflightServiceStructure(serviceSource);
  if (structuralProblems.length) {
    fail(`feed-day-preflight.service.ts: ${structuralProblems.join("; ")}`);
  }

  const files = walk(SCAN_ROOT).map((p) => ({
    relativePath: path.relative(ROOT, p),
    source: fs.readFileSync(p, "utf8"),
  }));
  const violations = scanForUnenforcedLoadCreators(files);
  if (violations.length) {
    fail(
      `${violations.length} feed-day load-creation path(s) can INSERT INTO mdata.loads without calling feedDayPreflight():\n` +
        violations.map((v) => `    ${v}`).join("\n")
    );
  }

  console.log(`${LABEL}: PASS — feed-day-preflight.service.ts carries all five checks (none hard-coded), 0 unenforced feed-day load-creation paths (${files.length} backend files scanned).`);
}

main();
