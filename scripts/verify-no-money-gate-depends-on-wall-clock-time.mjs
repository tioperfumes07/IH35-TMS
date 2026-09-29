#!/usr/bin/env node
// ROUND 251 Item 7 (owner, P0, 2026-09-30) — NEW STANDING LAW: no blocking money guard derives its
// verdict from wall-clock time.
//
// verify-no-document-without-a-ledger.mjs used to scope its population to
// `created_at >= now() - interval '7 days'`. That makes a blocking CI verdict depend on WHEN CI
// happens to run, not on the code or data being checked: the exact same commit passes or fails
// depending purely on which documents happen to be inside the rolling window that day. Live
// incident: #23103/#23101/#23089 got through, a later, unrelated PR did not, for reasons that had
// nothing to do with that PR's own diff -- only the calendar.
//
// This guard is a permanent, STATIC (no DATABASE_URL needed) scanner: it flags any
// scripts/verify-*.mjs file whose SQL uses a rolling `now() - interval` / `CURRENT_DATE - interval`
// window -- the exact fingerprint of "population narrows as the calendar moves forward." `//` line
// comments are stripped first so a guard's own documentation of this anti-pattern (like this file's
// own header, and verify-no-document-without-a-ledger.mjs's fix comment) is never self-flagged.
//
// NOT every hit is necessarily wrong -- some are a real, inherent business-time window (e.g. a
// factoring recourse period, an HOS daily-summary boundary), not an arbitrary CI-population
// shortcut. This guard does not judge that distinction; it is a shrink-only RATCHET (matching every
// other live-data guard in this repo's own discipline) so the population can never silently grow,
// and each file on the list is a queued item for someone to individually confirm is a genuine
// business rule (and comment it as such) or fix (like verify-no-document-without-a-ledger.mjs was).
//
// Self-test: node scripts/verify-no-money-gate-depends-on-wall-clock-time.mjs --selftest
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ALLOW_OFFLINE_SKIP =
  "pure static source-text scanner over scripts/verify-*.mjs, by design (ROUND 251 Item 7) -- never queries live data, so it never needs DATABASE_URL";

const LABEL = "verify-no-money-gate-depends-on-wall-clock-time";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPTS_DIR = path.join(ROOT, "scripts");
const WALL_CLOCK_RE = /(now\(\)|CURRENT_DATE)\s*-\s*interval/;
const LINE_COMMENT_RE = /\/\/[^\n]*/g;

// Shrink-only ratchet. Measured live 2026-09-30 after fixing verify-no-document-without-a-ledger.mjs
// (the one that caused this round's incident): 14 files still use a rolling wall-clock window.
// Never raise this number -- only lower it as each file is individually fixed or explicitly
// justified as a genuine business-time rule.
const KNOWN_WALL_CLOCK_FILES = 14;

const SELF_FILENAME = path.basename(fileURLToPath(import.meta.url));

export function findWallClockFiles(dir) {
  const hits = [];
  for (const entry of fs.readdirSync(dir)) {
    if (!entry.startsWith("verify-") || !entry.endsWith(".mjs")) continue;
    if (entry === SELF_FILENAME) continue; // this file's own selftest fixtures are test DATA, not a real query
    const full = path.join(dir, entry);
    if (!fs.statSync(full).isFile()) continue;
    const src = fs.readFileSync(full, "utf8");
    const stripped = src.replace(LINE_COMMENT_RE, "");
    if (WALL_CLOCK_RE.test(stripped)) {
      hits.push(path.relative(ROOT, full).split(path.sep).join("/"));
    }
  }
  return hits.sort();
}

function selftest() {
  const failures = [];
  const t = (label, cond) => {
    if (!cond) failures.push(label);
  };

  t(
    "the regex matches the real anti-pattern shape",
    WALL_CLOCK_RE.test("WHERE d.created_at >= now() - interval '7 days'")
  );
  t(
    "the regex also matches CURRENT_DATE",
    WALL_CLOCK_RE.test("WHERE d.created_at >= CURRENT_DATE - interval '30 days'")
  );
  t(
    "a plain now() with no interval subtraction is NOT flagged (e.g. voided_at = now())",
    !WALL_CLOCK_RE.test("UPDATE x SET voided_at = now()")
  );
  const commentOnly = "// this guard checks for now() - interval in a WHERE clause\nconst x = 1;";
  t(
    "a // line comment mentioning the pattern is stripped before matching",
    !WALL_CLOCK_RE.test(commentOnly.replace(LINE_COMMENT_RE, ""))
  );

  if (KNOWN_WALL_CLOCK_FILES < 0 || !Number.isInteger(KNOWN_WALL_CLOCK_FILES)) {
    failures.push("ratchet baseline must be a non-negative integer");
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest OK`);
}

function run() {
  const hits = findWallClockFiles(SCRIPTS_DIR);
  if (hits.length > KNOWN_WALL_CLOCK_FILES) {
    console.error(`${LABEL}: FAIL — ${hits.length} file(s) use a rolling now()/CURRENT_DATE - interval window, GREW past the ratchet baseline of ${KNOWN_WALL_CLOCK_FILES}:`);
    for (const h of hits) console.error(`  ✗ ${h}`);
    process.exit(1);
  }
  if (hits.length < KNOWN_WALL_CLOCK_FILES) {
    console.log(`${LABEL}: NOTE — ratchet improved (${hits.length} < baseline ${KNOWN_WALL_CLOCK_FILES}). Lower KNOWN_WALL_CLOCK_FILES in this file to match.`);
  }
  console.log(`${LABEL}: PASS — ${hits.length} file(s) still use a rolling wall-clock window (ratchet baseline ${KNOWN_WALL_CLOCK_FILES}, never grows). Each is queued for individual review (fix or justify as a genuine business-time rule): ${hits.join(", ") || "none"}.`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
