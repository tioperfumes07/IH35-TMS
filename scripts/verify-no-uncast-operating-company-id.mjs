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
import os from "node:os";

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
  // JS-style comments AND SQL line comments (`--`) — SQL prose embedded inside a template literal
  // (e.g. explaining an already-cast join a few lines below) is not executable SQL either. Caught
  // live: driver-finance/settlements.routes.ts had a `-- ... dsd.operating_company_id = $2, so the
  // UI's Hold action ...` line quoting the shape in prose, false-flagged before this widening.
  return (
    trimmed.startsWith("//") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("--")
  );
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

// GUARD-SELFTEST-MUTATES-SOURCE fix: the fixture directory used to live under
// apps/backend/src/__uncast_opco_selftest__ — an orphan there survives a kill as tracked-tree
// clutter (never a corrupted EXISTING file's content, since findViolations only ever creates a
// fresh probe file, but still a repo-tree write this class of guard must not make). Moved to a
// real OS temp dir; cleaned up in a finally that also runs on SIGTERM/SIGINT (not just normal
// return) — SIGKILL cannot be handled by any process, but a stray /tmp dir from that case is
// harmless, unlike a write anywhere under apps/ or packages/.
function selftest() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ih35-uncast-opco-selftest-"));
  const tmpFile = path.join(tmpDir, "probe.ts");
  const cleanup = () => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // best-effort — a leftover /tmp dir is harmless.
    }
  };
  const onSignal = (signal) => {
    cleanup();
    process.kill(process.pid, signal);
  };
  process.once("SIGTERM", onSignal);
  process.once("SIGINT", onSignal);

  try {
    // Clean case: cast, must not be flagged.
    fs.writeFileSync(tmpFile, `const sql = \`SELECT 1 FROM x WHERE operating_company_id = $1::uuid\`;\n`);
    const clean = findViolations(tmpDir);
    if (clean.length !== 0) {
      throw new Error(`SELFTEST FAIL: a cast comparison was flagged: ${JSON.stringify(clean)}`);
    }
    console.log("  ok: cast comparison not flagged");

    // Regex-backtracking trap: a cast TWO-DIGIT placeholder must not be misread as a shorter uncast one.
    fs.writeFileSync(tmpFile, `const sql = \`SELECT 1 FROM x WHERE operating_company_id = $12::uuid\`;\n`);
    const twoDigitCast = findViolations(tmpDir);
    if (twoDigitCast.length !== 0) {
      throw new Error(`SELFTEST FAIL: a cast two-digit placeholder was flagged (backtracking false positive): ${JSON.stringify(twoDigitCast)}`);
    }
    console.log("  ok: cast two-digit placeholder ($12::uuid) not flagged");

    // Regression case: bare $N, must be flagged.
    fs.writeFileSync(tmpFile, `const sql = \`SELECT 1 FROM x WHERE operating_company_id = $1\`;\n`);
    const caught = findViolations(tmpDir);
    if (caught.length !== 1) {
      throw new Error(`SELFTEST FAIL: a bare comparison was NOT flagged: ${JSON.stringify(caught)}`);
    }
    console.log("  caught: bare $N comparison flagged");

    // Comment case: bare $N inside a comment, must NOT be flagged (matches the sweep's own exclusion).
    fs.writeFileSync(tmpFile, `// operating_company_id = $1 is the shape that used to 500\n`);
    const commentSkipped = findViolations(tmpDir);
    if (commentSkipped.length !== 0) {
      throw new Error(`SELFTEST FAIL: a comment-line match was incorrectly flagged: ${JSON.stringify(commentSkipped)}`);
    }
    console.log("  ok: comment-line prose not flagged");

    // SQL-comment case: bare $N inside a `--` SQL line comment nested in a template literal (prose
    // explaining a join a few lines below), must NOT be flagged — same class as the JS-comment case.
    fs.writeFileSync(
      tmpFile,
      `const sql = \`\n  -- entity-pinned via dsd.operating_company_id = $2, so the UI can target it\n  SELECT 1\n\`;\n`
    );
    const sqlCommentSkipped = findViolations(tmpDir);
    if (sqlCommentSkipped.length !== 0) {
      throw new Error(`SELFTEST FAIL: a SQL "--" comment-line match was incorrectly flagged: ${JSON.stringify(sqlCommentSkipped)}`);
    }
    console.log("  ok: SQL '--' comment-line prose not flagged");

    console.log(`PASS ${LABEL} --selftest (mutation probes proven non-inert: 2; false-positive traps proven closed: 2)`);
  } finally {
    cleanup();
    process.removeListener("SIGTERM", onSignal);
    process.removeListener("SIGINT", onSignal);
  }
}

if (process.argv.includes("--selftest")) {
  try {
    selftest();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
} else {
  main();
}
