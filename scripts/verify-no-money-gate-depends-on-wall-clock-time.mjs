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
// 2026-10-04 (CC-2): 16 -> 13. bank-tieout-live and preserve-ledger anchored to their job's last recorded run,
// party-boards-bound-live to the window the engine returns — no new file added, three removed.
// Never raise this number -- only lower it as each file is individually fixed or explicitly
// justified as a genuine business-time rule.
const KNOWN_WALL_CLOCK_FILES = 13;

// LST-F404 (Lead, 2026-10-04) — the escape hatch the comment above promised and never built. A file that is CORRECTLY
// clock-dependent (a freshness / liveness probe whose verdict is SUPPOSED to change as time passes) is recorded here BY
// NAME with its reason; a number alone can never satisfy this guard. Rules (all enforced, selftested):
//   * every entry carries a non-empty reason;
//   * every entry names a file that still matches (an entry for a fixed file is stale -> FAIL, the list cannot rot);
//   * justified files are reported by name and are NOT counted against KNOWN_WALL_CLOCK_FILES.
// Empty on 2026-10-04: the two the Lead named (bank-tieout-live, preserve-ledger) were anchored to their job's last
// recorded run by CC-2 (0037e76ecf), so they no longer match and must not be listed.
export const JUSTIFIED_WALL_CLOCK = {};

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

/** The verdict, pure: hits (files matching), the named allowlist, the unreviewed baseline. */
export function evaluate(hits, justified, baseline) {
  const problems = [];
  for (const [file, reason] of Object.entries(justified)) {
    if (typeof reason !== "string" || reason.trim().length < 10) problems.push(`JUSTIFIED entry ${file} has no reason — no silent entries`);
    if (!hits.includes(file)) problems.push(`JUSTIFIED entry ${file} no longer matches — remove it (the allowlist cannot rot)`);
  }
  const justifiedHits = hits.filter((h) => Object.prototype.hasOwnProperty.call(justified, h));
  const unreviewed = hits.filter((h) => !Object.prototype.hasOwnProperty.call(justified, h));
  if (unreviewed.length > baseline) problems.push(`${unreviewed.length} unreviewed file(s) use a rolling now()/CURRENT_DATE - interval window, GREW past the ratchet baseline of ${baseline}`);
  // The defect that carried a phantom 14th slot for five days: an improvement that is only a NOTE leaves room for a
  // new offender to take the freed slot silently. A lower count must be ratcheted down in the same commit.
  if (unreviewed.length < baseline) problems.push(`${unreviewed.length} unreviewed < baseline ${baseline} — ratchet down in this commit (lower KNOWN_WALL_CLOCK_FILES to ${unreviewed.length})`);
  return { problems, unreviewed, justifiedHits };
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

  // LST-F404 — the five cases the Lead named.
  const A = "scripts/verify-a.mjs", B = "scripts/verify-b.mjs", C = "scripts/verify-c.mjs";
  const why = "freshness probe — staleness cannot be measured without the clock";
  {
    const r = evaluate([A, B], { [B]: why }, 1);
    t("1. a JUSTIFIED file that still matches passes and is reported by name", r.problems.length === 0 && r.justifiedHits.includes(B) && !r.unreviewed.includes(B));
  }
  t("2. a JUSTIFIED entry with an empty reason fails", evaluate([A, B], { [B]: "" }, 1).problems.some((x) => /no reason/.test(x)));
  t("3. unreviewed count above the baseline fails", evaluate([A, B, C], {}, 2).problems.some((x) => /GREW/.test(x)));
  t("4. unreviewed count below the baseline fails (ratchet down in this commit)", evaluate([A], {}, 2).problems.some((x) => /ratchet down in this commit/.test(x)));
  t("5. a JUSTIFIED entry naming a file that no longer matches fails", evaluate([A], { [B]: why }, 1).problems.some((x) => /no longer matches/.test(x)));

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
  const { problems, unreviewed, justifiedHits } = evaluate(hits, JUSTIFIED_WALL_CLOCK, KNOWN_WALL_CLOCK_FILES);
  if (problems.length) {
    console.error(`${LABEL}: FAIL — ${problems.join("; ")}`);
    for (const h of unreviewed) console.error(`  ✗ ${h}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — ${unreviewed.length} unreviewed + ${justifiedHits.length} justified (named${justifiedHits.length ? ": " + justifiedHits.join(", ") : ""}). Ratchet baseline ${KNOWN_WALL_CLOCK_FILES}, never grows; each unreviewed file is queued to be fixed or justified by name: ${unreviewed.join(", ") || "none"}.`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
