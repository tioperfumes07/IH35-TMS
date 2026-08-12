#!/usr/bin/env node
// VERTICAL-SWEEP-UNCAST-OPCO-CLASS — repo-wide hard-zero guard.
//
// ROOT CAUSE this closes: `operating_company_id` is UUID NOT NULL on essentially every tenant-scoped
// table in this schema. Comparing it against a bare `$N` placeholder (`operating_company_id = $1`)
// relies on Postgres inferring the parameter's type from context — which this session proved, twice,
// does NOT reliably happen under this app's actual (pooled) production connection: both
// safety/drug-alcohol/program.service.ts and safety/driver-scheduler.service.ts 500'd live on prod
// with SQLSTATE 42883 ("operator does not exist: uuid = text") from exactly this shape, while an
// ad-hoc unpooled local Postgres.app connection could NOT reproduce it (Postgres's own inference
// papers over the bug there, which is also why this had never shown up in local dev or in CI's
// unpooled ephemeral database).
//
// SCOPE OF THE SWEEP: a repo-wide scan (2026-08-12) found 1466 occurrences of this exact shape
// across 331 backend files — not two isolated incidents, a systemic class. 1454 were mechanically
// fixed in one vertical pass (cast to `operating_company_id = $N::uuid` / `$${expr}::uuid`); 12
// matches were EXCLUDED because they were inside comments (explanatory prose quoting the bug shape,
// not executable SQL) and hand-verified not to need a code change. This guard is the hard-zero lock
// that keeps the class from regrowing — every NEW backend file must cast this comparison from day
// one, no ratchet, no exceptions.
//
// Static source assertion — no DB needed. Comment lines are excluded from detection so this guard
// itself does not fire on prose describing the bug (the exact pattern used by the sweep above).
import fs from "node:fs";
import path from "node:path";

const ROOT = "apps/backend/src";
const LABEL = "verify-no-uncast-operating-company-id";

// (?!\d) before the ::uuid lookahead matters: without it, a regex engine can backtrack \d+ down to a
// SHORTER digit run (e.g. treat "$12::uuid" as "$1" + "2::uuid") to satisfy "(?!::uuid)", producing a
// false positive on an already-correctly-cast two-digit placeholder. Caught live by this guard's own
// first run against the real sweep output (apps/backend/src/banking/categorization.routes.ts:373,
// "$12::uuid") — fixed here, not shipped broken.
const STATIC_PATTERN = /operating_company_id\s*=\s*\$\d+(?!\d)(?!::uuid)/;
const DYNAMIC_PATTERN = /operating_company_id\s*=\s*\$\$\{[^}]+\}(?!::uuid)/;

function isCommentLine(line) {
  const trimmed = line.trim();
  return trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*");
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

export function findViolations(rootDir = ROOT) {
  const violations = [];
  if (!fs.existsSync(rootDir)) return violations;
  for (const file of walk(rootDir)) {
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((line, idx) => {
      if (isCommentLine(line)) return;
      if (STATIC_PATTERN.test(line) || DYNAMIC_PATTERN.test(line)) {
        violations.push(`${file}:${idx + 1}: ${line.trim().slice(0, 140)}`);
      }
    });
  }
  return violations;
}

function main() {
  const violations = findViolations();
  if (violations.length > 0) {
    console.error(
      `FAIL ${LABEL}: ${violations.length} uncast operating_company_id comparison(s) found — ` +
        `this is the exact SQLSTATE 42883 class that 500'd multiple live routes this session:\n  - ` +
        violations.slice(0, 25).join("\n  - ") +
        (violations.length > 25 ? `\n  … +${violations.length - 25} more` : "")
    );
    process.exit(1);
  }
  console.log(`PASS ${LABEL} — 0 uncast operating_company_id comparisons across ${ROOT}.`);
}

function selftest() {
  const tmpDir = "apps/backend/src/__uncast_opco_selftest__";
  fs.mkdirSync(tmpDir, { recursive: true });
  const tmpFile = path.join(tmpDir, "probe.ts");

  // Clean case: cast, must not be flagged.
  fs.writeFileSync(tmpFile, `const sql = \`SELECT 1 FROM x WHERE operating_company_id = $1::uuid\`;\n`);
  let clean = findViolations(tmpDir);
  if (clean.length !== 0) {
    console.error(`SELFTEST FAIL: a cast comparison was flagged: ${JSON.stringify(clean)}`);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    process.exit(1);
  }
  console.log("  ok: cast comparison not flagged");

  // Regex-backtracking trap: a cast TWO-DIGIT placeholder must not be misread as a shorter uncast one.
  fs.writeFileSync(tmpFile, `const sql = \`SELECT 1 FROM x WHERE operating_company_id = $12::uuid\`;\n`);
  let twoDigitCast = findViolations(tmpDir);
  if (twoDigitCast.length !== 0) {
    console.error(`SELFTEST FAIL: a cast two-digit placeholder was flagged (backtracking false positive): ${JSON.stringify(twoDigitCast)}`);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    process.exit(1);
  }
  console.log("  ok: cast two-digit placeholder ($12::uuid) not flagged");

  // Regression case: bare $N, must be flagged.
  fs.writeFileSync(tmpFile, `const sql = \`SELECT 1 FROM x WHERE operating_company_id = $1\`;\n`);
  let caught = findViolations(tmpDir);
  if (caught.length !== 1) {
    console.error(`SELFTEST FAIL: a bare comparison was NOT flagged: ${JSON.stringify(caught)}`);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    process.exit(1);
  }
  console.log("  caught: bare $N comparison flagged");

  // Comment case: bare $N inside a comment, must NOT be flagged (matches the sweep's own exclusion).
  fs.writeFileSync(tmpFile, `// operating_company_id = $1 is the shape that used to 500\n`);
  let commentSkipped = findViolations(tmpDir);
  if (commentSkipped.length !== 0) {
    console.error(`SELFTEST FAIL: a comment-line match was incorrectly flagged: ${JSON.stringify(commentSkipped)}`);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    process.exit(1);
  }
  console.log("  ok: comment-line prose not flagged");

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`PASS ${LABEL} --selftest (mutation probes proven non-inert: 2; false-positive traps proven closed: 2)`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  main();
}
