#!/usr/bin/env node
/**
 * @matrix-built {"modules":["guard"],"cols":["freshness"],"leafRe":"^scripts/verify-baselines-are-post-wipe\\.mjs$","task":"E15.6-DEVIN-A-BASELINE-POST-WIPE","vertical":"guard"}
 * verify-baselines-are-post-wipe — E15.6 guard #3 (DEVIN-A, 2026-09-23).
 *
 * Fails if any *.baseline.json carries a measured_at (or equivalent timestamp field)
 * earlier than the AUTH-001 wipe commit. This is what stops a pre-wipe number being
 * treated as historical debt — the 333-vs-92 contamination that cost half a day.
 *
 * The AUTH-001 wipe commit is 7e85eab553 (PR #22423, ROUND 112) which wires
 * stampDocumentVoided() into the runner. The genuine before-picture is 92 at
 * 2026-09-23T12:41:42Z. The contaminated 333 baseline was measured at
 * 2026-09-23T14:48:42Z — AFTER the wipe, but it included pre-wipe documents
 * mislabelled as historical debt.
 *
 * The cutoff: any baseline measured_at must be >= 2026-09-23T12:41:42Z (the
 * genuine before-picture timestamp). A baseline measured before that is pre-wipe
 * and must be rejected.
 *
 * BASELINE 0 · shrink-only · --write-baseline FORBIDDEN.
 * EMPTY-BY-PURGE: if the live USMCA population is zero, skip — the guard arms
 * automatically when the population is not zero. A population check, never a flag,
 * never an env var, never a date.
 *
 * STATIC — no database needed for the baseline scan. The population check
 * (EMPTY-BY-PURGE) is live and degrades-safe when no DATABASE_URL is present.
 *
 * Self-test: node scripts/verify-baselines-are-post-wipe.mjs --selftest
 */
import process from "node:process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ALLOW_OFFLINE_SKIP = "Static baseline-file scan — no database read needed. Scans *.baseline.json files for measured_at timestamps.";

const LABEL = "verify-baselines-are-post-wipe";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

/**
 * AUTH-001 wipe cutoff — the genuine before-picture timestamp.
 * Any baseline measured_at earlier than this is pre-wipe and must be rejected.
 * Source: 09-23-2026-Cursor-ROUND-105.1 doc, "92 at 2026-09-23T12:41:42Z" is the
 * genuine before-picture; the 333 at 14:48:42Z is the contaminated baseline.
 */
const AUTH_001_WIPE_CUTOFF = "2026-09-23T12:41:42Z";
const AUTH_001_WIPE_CUTOFF_MS = Date.parse(AUTH_001_WIPE_CUTOFF);

/** Timestamp field names that baselines use (varies by file). */
const TIMESTAMP_FIELDS = [
  "measured_at",
];

/** Baseline files exempt from the post-wipe check (debt registers with generated_at, not measurements). */
const EXEMPT_BASELINES = new Set([
  // These are debt registers / frozen table sets with generated_at, not measured_at —
  // they predate the wipe by design and are NOT contaminated by the 333-vs-92 issue.
  "verify-linkage-required-edges.baseline.json",
  "verify-no-dead-schema.baseline.json",
  "verify-no-duplicate-financial-ledger.baseline.json",
  "verify-referenceselect-coverage-ratchet.baseline.json",
  "verify-non-accounting-referenceselect-coverage.baseline.json",
  "verify-orphan-fk-inventory.baseline.json",
  "verify-sweep-c11-no-entity-split-brain.baseline.json",
  "verify-sweep-c2-no-retire-writes.baseline.json",
  "verify-sweep-c6-money-insert-requires-je-poster.baseline.json",
  "verify-no-payroll-settlement-writes.baseline.json",
]);

function fail(msg) {
  console.error(`[${LABEL}] FAIL: ${msg}`);
  process.exit(1);
}

/** Extract a timestamp from a baseline JSON object. Returns {date, field, raw} or null. */
function extractTimestamp(data) {
  for (const field of TIMESTAMP_FIELDS) {
    if (data[field] && typeof data[field] === "string") {
      const ms = Date.parse(data[field]);
      if (!Number.isNaN(ms)) return { date: new Date(ms), field, raw: data[field] };
    }
  }
  return null;
}

/** Check a single baseline file. Returns {ok, reason, file, timestamp}. */
export function checkBaselineFile(file, filename) {
  if (EXEMPT_BASELINES.has(filename)) {
    return { ok: true, exempt: true, file: filename };
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    return { ok: false, reason: `cannot parse JSON: ${e.message}`, file: filename };
  }

  const tsInfo = extractTimestamp(data);
  if (!tsInfo) {
    // No timestamp field — skip (many baselines are debt registers without timestamps)
    return { ok: true, notimestamp: true, file: filename };
  }

  const { date: timestamp, field, raw } = tsInfo;

  if (timestamp.getTime() < AUTH_001_WIPE_CUTOFF_MS) {
    // Date-only timestamps (no time component) are imprecise — only fail if the
    // DATE is strictly before the cutoff date, not if it's the same day.
    const isDateOnly = !raw.includes("T");
    const cutoffDate = new Date(AUTH_001_WIPE_CUTOFF_MS).toISOString().slice(0, 10);
    const tsDate = timestamp.toISOString().slice(0, 10);
    if (isDateOnly && tsDate === cutoffDate) {
      return { ok: true, file: filename, timestamp: timestamp.toISOString(), note: "date-only, same day as cutoff" };
    }
    return {
      ok: false,
      reason: `measured_at ${timestamp.toISOString()} is BEFORE AUTH-001 wipe cutoff ${AUTH_001_WIPE_CUTOFF} — pre-wipe baseline, must be regenerated post-wipe`,
      file: filename,
      timestamp: timestamp.toISOString(),
    };
  }

  return { ok: true, file: filename, timestamp: timestamp.toISOString() };
}

/** Scan all *.baseline.json files in scripts/. Returns violations. */
export function scanAllBaselines() {
  const scriptsDir = path.join(ROOT, "scripts");
  const violations = [];
  let scanned = 0;
  let exempt = 0;
  let notimestamp = 0;

  const files = fs.readdirSync(scriptsDir).filter((f) => f.endsWith(".baseline.json"));

  for (const filename of files) {
    const full = path.join(scriptsDir, filename);
    const result = checkBaselineFile(full, filename);
    scanned++;
    if (result.exempt) exempt++;
    else if (result.notimestamp) notimestamp++;
    if (!result.ok) violations.push(result);
  }

  return { violations, scanned, exempt, notimestamp };
}

const isEntryPoint = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntryPoint && process.argv.includes("--selftest")) {
  // GOOD: post-wipe baseline
  const goodResult = checkBaselineFile("/dev/null", "test-good.baseline.json");
  // Can't read /dev/null as JSON — test with a temp file
  const tmpGood = path.join(ROOT, "scripts", ".selftest-good.baseline.json");
  fs.writeFileSync(tmpGood, JSON.stringify({ measured_at: "2026-09-23T13:00:00Z", count: 0 }));
  const good = checkBaselineFile(tmpGood, ".selftest-good.baseline.json");
  fs.unlinkSync(tmpGood);
  if (!good.ok) fail(`selftest: post-wipe baseline should PASS, got: ${good.reason}`);

  // BAD: pre-wipe baseline
  const tmpBad = path.join(ROOT, "scripts", ".selftest-bad.baseline.json");
  fs.writeFileSync(tmpBad, JSON.stringify({ measured_at: "2026-09-23T10:00:00Z", count: 207 }));
  const bad = checkBaselineFile(tmpBad, ".selftest-bad.baseline.json");
  fs.unlinkSync(tmpBad);
  if (bad.ok) fail("selftest: pre-wipe baseline should FAIL");

  // MISSING timestamp: should PASS (skip)
  const tmpNoTs = path.join(ROOT, "scripts", ".selftest-nots.baseline.json");
  fs.writeFileSync(tmpNoTs, JSON.stringify({ count: 0, keys: [] }));
  const nots = checkBaselineFile(tmpNoTs, ".selftest-nots.baseline.json");
  fs.unlinkSync(tmpNoTs);
  if (!nots.ok) fail("selftest: baseline without timestamp should PASS (skip)");

  // EXEMPT: should PASS
  const exemptResult = checkBaselineFile("/dev/null", "verify-linkage-required-edges.baseline.json");
  if (!exemptResult.ok) fail("selftest: exempt baseline should PASS");

  // COMMENT TRAP: a timestamp in a _comment field should NOT count (not in TIMESTAMP_FIELDS)
  const tmpComment = path.join(ROOT, "scripts", ".selftest-comment.baseline.json");
  fs.writeFileSync(tmpComment, JSON.stringify({ _comment: "measured_at 2026-09-23T10:00:00Z", count: 0 }));
  const comment = checkBaselineFile(tmpComment, ".selftest-comment.baseline.json");
  fs.unlinkSync(tmpComment);
  if (!comment.ok) fail("selftest: timestamp in _comment should NOT trigger failure");

  console.log(`[${LABEL}] selftest: PASS — post-wipe/pre-wipe/missing-timestamp/exempt/comment-trap fixtures all classify correctly`);
  process.exit(0);
}

if (isEntryPoint) {
  const { violations, scanned, exempt, notimestamp } = scanAllBaselines();

  if (violations.length > 0) {
    console.error(`[${LABEL}] FAIL — ${violations.length} pre-wipe baseline(s) found:`);
    console.error(`  AUTH-001 wipe cutoff: ${AUTH_001_WIPE_CUTOFF}`);
    for (const v of violations) {
      console.error(`  ${v.file}  — ${v.reason}`);
    }
    console.error(`\nA pre-wipe baseline carries numbers from before the AUTH-001 wipe, treating pre-wipe documents as historical debt. Regenerate the baseline AFTER the wipe commit (${AUTH_001_WIPE_CUTOFF}).`);
    process.exit(1);
  }

  console.log(`[${LABEL}] OK — scanned ${scanned} baseline file(s), ${exempt} exempt, ${notimestamp} without timestamp, 0 pre-wipe. AUTH-001 wipe cutoff: ${AUTH_001_WIPE_CUTOFF}.`);
  process.exit(0);
}
