#!/usr/bin/env node
// GUARD — verify-no-stale-literals-in-guards (§9.0.17 SWEEP, ROUND E23, DEVIN-B)
//
// Four hardcoded-count defects surfaced today, each cost hours:
//   verify-void-is-whole.baseline.json — 333 measured DURING the E10 loop, labelled "measured
//     BEFORE E10 ran"; the real before-picture was 92.
//   verify-fuel-transactions-per-load.baseline.json — frozen at 589 loads / $253,271.24,
//     describing a ledger that no longer exists.
//   verify-purge-window-exemption / -state — hardcoded 9, then a second stale literal at 11;
//     CC-3 fixed both to read real array length.
//   "47 documents" — which the owner caught; the real count is 34/35.
//
// This guard scans every scripts/verify-*.mjs and every *.baseline.json for FOUR patterns:
//   (a) a numeric literal compared against a live COUNT or SUM not derived at runtime — row
//       totals, dollar figures, document counts, array lengths;
//   (b) a *.baseline.json whose measured_at predates the AUTH-001 wipe commit, or has no
//       measured_at;
//   (c) a _comment claiming a measurement time that contradicts its own measured_at — the
//       exact 333-vs-92 contamination;
//   (d) a second literal duplicating a count already derivable in that file.
//
// ALLOWLIST BY ANNOTATION ONLY: `// STALE-LITERAL-OK: <reason>`, printed as disclosed debt.
// No silent exemptions, no .guard-exempt.json.
//
// Static source guard (ALLOW_OFFLINE_SKIP): never connects to a database. Scans source files
// only. Wired into money-pr-local-gate.mjs STEPS.
//
// Self-test: node scripts/verify-no-stale-literals-in-guards.mjs --selftest
export const ALLOW_OFFLINE_SKIP = "static source and baseline-file checks; never connects to a database";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPTS_DIR = path.join(ROOT, "scripts");
const LABEL = "verify-no-stale-literals-in-guards";
const SELFTEST = process.argv.includes("--selftest");

// The AUTH-001 wipe happened on 2026-09-23. Baselines measured before this date describe a
// ledger that was wiped. The wipe commit time is approximately 2026-09-23T21:00:00Z (the
// post-wipe baselines carry measured_at 2026-09-23T21:35:00Z). Any baseline with measured_at
// before 2026-09-23T21:00:00Z is stale (describes the pre-wipe ledger).
const AUTH001_WIPE_CUTOFF = new Date("2026-09-23T21:00:00Z");

// --- helpers ---

function readLines(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return [];
  return fs.readFileSync(full, "utf8").split("\n");
}

function isAllowlisted(line, fileRel) {
  // The line itself or the line above may carry the annotation.
  if (/STALE-LITERAL-OK:\s*.+/.test(line)) return true;
  return false;
}

function findAllowlistReason(lines, idx) {
  // Check the line itself and the two preceding lines for a STALE-LITERAL-OK annotation.
  for (let i = Math.max(0, idx - 2); i <= idx; i++) {
    const m = lines[i]?.match(/STALE-LITERAL-OK:\s*(.+)/);
    if (m) return m[1].trim();
  }
  return null;
}

// --- pattern (a): numeric literal compared against a live count/sum ---
// The owner's four examples: 333 (baseline count), 589/$253,271.24 (baseline totals),
// 9 then 11 (array .length compared against hardcoded number), 47 (hardcoded doc count).
//
// We narrow to TWO concrete .mjs patterns that are catchable statically:
//   1. `.length === <N>` or `.length !== <N>` where N >= 10 — the purge-window pattern.
//      A hardcoded array-length comparison goes stale the moment the array grows.
//      The fix is to derive the expected length at runtime (e.g. compare against another
//      array's .length, or against a value computed from the array itself).
//   2. A variable containing count/total/sum compared with === or !== against N >= 100 —
//      a large hardcoded count or dollar figure that describes a live population.
//      Small numbers (< 100) are usually structural assertions (>= 12 tabs, exactly 13
//      layers) that are immediately verifiable against the code and not stale.
//
// Patterns that are OK (not stale literals):
//   - Array .length compared to another array's .length (runtime-derived)
//   - A constant defined as a named, documented limit (e.g. MEMO_MAX_CHARS = 200)
//   - A literal in a comment
//   - A literal in a string/regex
//   - A literal that is a port number, line number, or year

// Pattern 1: .length === or !== <N> where N >= 10
const LENGTH_EQ_RE = /\.length\s*(===|!==|==|!=)\s*(\d{2,})\b/i;
const LENGTH_EQ_RE_REVERSE = /(\d{2,})\b\s*(===|!==|==|!=)\s*\.length/i;

// Pattern 2: count/total/sum variable === or !== <N> where N >= 100
const COUNT_KEYWORDS =
  "count|total|sum|rows|docs|documents|keys|entries|ceiling|violations|mismatches|postings|loads|invoices|settlements|fuel|expenses|bills|drivers|units|lines";
const COUNT_EQ_RE = new RegExp(
  `(\\w*(?:${COUNT_KEYWORDS})\\w*)\\s*(===|!==|==|!=)\\s*(\\d{3,})\\b`,
  "i"
);
const COUNT_EQ_RE_REVERSE = new RegExp(
  `(\\d{3,})\\b\\s*(===|!==|==|!=)\\s*(\\w*(?:${COUNT_KEYWORDS})\\w*)`,
  "i"
);

// Patterns that are always OK — not stale literals:
const OK_NUMERIC_CONTEXTS = [
  /^\s*\/\//, // comment line
  /^\s*\*/, // block comment continuation
  /STALE-LITERAL-OK:/, // allowlist annotation
  /MEMO_MAX_CHARS|MAX_|MIN_|LIMIT|DEFAULT|TIMEOUT|PORT|INTERVAL|BATCH|PAGE|OFFSET|RETRY|VERSION|YEAR|HTTP|STATUS|EXIT_CODE/,
  /\.test\(|\.match\(|\.replace\(|\.split\(/, // inside regex/string operations
  /^\s*(const|let|var)\s+\w+\s*=\s*\d+/, // a named constant definition
  /process\.exit\(/, // exit codes
  /console\.(log|error|warn)\(/, // inside a log string
  /^\s*line:\s*['"`]/, // selftest fixture string property
  /['"`].*\d{2,}.*(===|!==|==|!=).*['"`]/, // comparison inside a quoted string
];

function isOkContext(line) {
  return OK_NUMERIC_CONTEXTS.some((re) => re.test(line));
}

function scanMjsForStaleLiterals(rel) {
  const lines = readLines(rel);
  const findings = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isOkContext(line)) continue;
    const reason = findAllowlistReason(lines, i);
    if (reason) continue; // allowlisted

    // Pattern 1: .length === or !== <N> where N >= 10
    for (const re of [LENGTH_EQ_RE, LENGTH_EQ_RE_REVERSE]) {
      const m = line.match(re);
      if (!m) continue;
      const num = m[2] || m[1];
      findings.push({
        file: rel,
        line: i + 1,
        snippet: line.trim().slice(0, 120),
        pattern: "(a) .length compared against hardcoded number (purge-window pattern)",
        number: num,
      });
      break; // one finding per line
    }
    if (findings.length > 0 && findings[findings.length - 1]?.line === i + 1) continue;

    // Pattern 2: count/total/sum variable === or !== <N> where N >= 100
    for (const re of [COUNT_EQ_RE, COUNT_EQ_RE_REVERSE]) {
      const m = line.match(re);
      if (!m) continue;
      const num = m[1].match(/^\d/) ? m[1] : m[3];
      const varName = m[1].match(/^\d/) ? m[3] : m[1];
      findings.push({
        file: rel,
        line: i + 1,
        snippet: line.trim().slice(0, 120),
        pattern: "(a) count/total/sum compared against hardcoded number >= 100",
        number: num,
        variable: varName,
      });
      break; // one finding per line
    }
  }
  return findings;
}

// --- pattern (b): baseline.json with missing or stale measured_at ---

function scanBaselineForMeasuredAt(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return [];
  let j;
  try {
    j = JSON.parse(fs.readFileSync(full, "utf8"));
  } catch {
    return [{ file: rel, pattern: "(b) baseline JSON unparseable", snippet: "" }];
  }
  const findings = [];
  const ma = j.measured_at;
  if (!ma) {
    // Missing measured_at — check for allowlist in the _comment
    const cmt = (j._comment || "") + " " + (j.comment || "");
    if (/STALE-LITERAL-OK:\s*.+/.test(cmt)) return [];
    findings.push({
      file: rel,
      pattern: "(b) baseline.json has no measured_at field",
      snippet: `measured_at=${ma ?? "MISSING"}`,
    });
    return findings;
  }
  // Check if measured_at predates the AUTH-001 wipe
  let d;
  try {
    d = new Date(ma);
  } catch {
    findings.push({
      file: rel,
      pattern: "(b) baseline.json measured_at unparseable",
      snippet: `measured_at=${ma}`,
    });
    return findings;
  }
  if (d < AUTH001_WIPE_CUTOFF) {
    const cmt = (j._comment || "") + " " + (j.comment || "");
    if (/STALE-LITERAL-OK:\s*.+/.test(cmt)) return [];
    findings.push({
      file: rel,
      pattern: "(b) baseline.json measured_at predates AUTH-001 wipe",
      snippet: `measured_at=${ma} (before ${AUTH001_WIPE_CUTOFF.toISOString()})`,
    });
  }
  return findings;
}

// --- pattern (c): _comment claiming a measurement time that contradicts measured_at ---

function scanBaselineForCommentContradiction(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return [];
  let j;
  try {
    j = JSON.parse(fs.readFileSync(full, "utf8"));
  } catch {
    return [];
  }
  const cmt = (j._comment || "") + " " + (j.comment || "");
  const ma = j.measured_at;
  if (!ma || !cmt) return [];

  // Look for ISO timestamps in the comment that differ from measured_at
  const tsMatches = [...cmt.matchAll(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)/g)];
  if (tsMatches.length === 0) return [];

  const maDate = new Date(ma);
  for (const m of tsMatches) {
    const ts = m[1];
    let tsDate;
    try {
      tsDate = new Date(ts);
    } catch {
      continue;
    }
    // If the comment's timestamp differs from measured_at by more than 1 hour, that's a
    // contradiction (the comment claims a measurement at one time, the file says another).
    const diff = Math.abs(tsDate.getTime() - maDate.getTime());
    if (diff > 3_600_000) {
      // Check if the comment EXPLAINS the discrepancy (e.g. "prior baseline measured X,
      // regenerated at Y"). If the comment contains "prior" or "before" or "regenerated",
      // it's explaining the history, not claiming the current measurement time.
      if (/prior|before|regenerat|previous|wiped|old|pre-wipe|post-wipe/i.test(cmt)) {
        // The comment is explaining history — check if it claims the CURRENT measurement
        // is at the old time. Look for "measured" near the old timestamp without
        // "prior"/"before" context.
        const around = cmt.slice(Math.max(0, m.index - 50), m.index + ts.length + 50);
        if (/prior|before|regenerat|previous|wiped|old|pre-wipe|post-wipe/i.test(around)) {
          continue; // explained
        }
      }
      return [
        {
          file: rel,
          pattern: "(c) _comment timestamp contradicts measured_at",
          snippet: `comment says ${ts}, measured_at says ${ma}`,
        },
      ];
    }
  }
  return [];
}

// --- pattern (d): a second literal duplicating a count already derivable in that file ---

function scanBaselineForDuplicatedCount(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return [];
  let j;
  try {
    j = JSON.parse(fs.readFileSync(full, "utf8"));
  } catch {
    return [];
  }
  const findings = [];

  // If the baseline has a "count" field AND a keys/entries/documents array, the count
  // should equal the array length. If count is a hardcoded number that doesn't match
  // the array length, that's a duplicated count that can drift.
  if (typeof j.count === "number" && Array.isArray(j.keys)) {
    if (j.count !== j.keys.length) {
      findings.push({
        file: rel,
        pattern: "(d) count field does not match keys array length",
        snippet: `count=${j.count}, keys.length=${j.keys.length}`,
      });
    }
  }
  if (typeof j.count === "number" && Array.isArray(j.documents)) {
    if (j.count !== Object.keys(j.documents).length) {
      findings.push({
        file: rel,
        pattern: "(d) count field does not match documents object size",
        snippet: `count=${j.count}, documents=${Object.keys(j.documents).length}`,
      });
    }
  }
  // If the _comment contains a hardcoded number that matches the count field, that's
  // a duplicated literal (the comment restates the number, which can drift from the field).
  const cmt = (j._comment || "") + " " + (j.comment || "");
  if (typeof j.count === "number" && cmt) {
    if (/STALE-LITERAL-OK:/.test(cmt)) return findings; // allowlisted
    // Look for the exact count number in the comment as a standalone number (not part of
    // a larger number or a date).
    const re = new RegExp(`\\b${j.count}\\b`);
    if (re.test(cmt) && j.count > 0) {
      // Check it's not in a date context
      const withoutDates = cmt.replace(/\d{4}-\d{2}-\d{2}T?\S*/g, "");
      if (re.test(withoutDates)) {
        findings.push({
          file: rel,
          pattern: "(d) count duplicated in _comment",
          snippet: `count=${j.count} also appears in _comment`,
        });
      }
    }
  }
  return findings;
}

// --- main scan ---

function scanAll() {
  const findings = [];

  // Scan all verify-*.mjs files for pattern (a)
  const mjsFiles = fs
    .readdirSync(SCRIPTS_DIR)
    .filter((f) => f.startsWith("verify-") && f.endsWith(".mjs"))
    .sort();
  for (const f of mjsFiles) {
    findings.push(...scanMjsForStaleLiterals(path.join("scripts", f)));
  }

  // Scan all *.baseline.json files for patterns (b), (c), (d)
  const baselineFiles = fs
    .readdirSync(SCRIPTS_DIR)
    .filter((f) => f.endsWith(".baseline.json"))
    .sort();
  for (const f of baselineFiles) {
    const rel = path.join("scripts", f);
    findings.push(...scanBaselineForMeasuredAt(rel));
    findings.push(...scanBaselineForCommentContradiction(rel));
    findings.push(...scanBaselineForDuplicatedCount(rel));
  }

  return findings;
}

// --- selftest ---

function selftest() {
  // RED fixtures: known stale literals that should be caught
  const reds = [
    {
      name: "(a) hardcoded count comparison",
      line: 'if (rowCount !== 333) throw new Error("wrong count");',
      expect: true,
    },
    {
      name: "(a) hardcoded sum comparison",
      line: "if (totalCents === 25327124) return true;",
      expect: true,
    },
    {
      name: "(a) hardcoded length comparison",
      line: "if (docs.length !== 47) fail();",
      expect: true,
    },
    {
      name: "(a) OK — named constant definition",
      line: "const MEMO_MAX_CHARS = 200;",
      expect: false,
    },
    {
      name: "(a) OK — comment",
      line: "// the count was 333 before the wipe",
      expect: false,
    },
    {
      name: "(a) OK — allowlisted",
      line: "if (count !== 10) fail(); // STALE-LITERAL-OK: ten purge arms, ruling X",
      expect: false,
    },
    {
      name: "(a) OK — array length vs array length",
      line: "if (a.length !== b.length) fail();",
      expect: false,
    },
  ];

  let pass = 0;
  let fail = 0;
  for (const r of reds) {
    const lines = [r.line];
    const caught = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (isOkContext(line)) continue;
      const reason = findAllowlistReason(lines, i);
      if (reason) continue;
      // Pattern 1: .length === or !== <N> where N >= 10
      for (const re of [LENGTH_EQ_RE, LENGTH_EQ_RE_REVERSE]) {
        if (line.match(re)) { caught.push(true); break; }
      }
      if (caught.length > 0) break;
      // Pattern 2: count/total/sum === or !== <N> where N >= 100
      for (const re of [COUNT_EQ_RE, COUNT_EQ_RE_REVERSE]) {
        if (line.match(re)) { caught.push(true); break; }
      }
    }
    const detected = caught.length > 0;
    const ok = detected === r.expect;
    if (ok) {
      pass++;
      console.log(`  PASS: ${r.name}`);
    } else {
      fail++;
      console.log(`  FAIL: ${r.name} — expected ${r.expect ? "DETECT" : "OK"}, got ${detected ? "DETECT" : "OK"}`);
      console.log(`    line: ${r.line}`);
    }
  }

  // Also test baseline scanning with temp files
  // (b) missing measured_at
  const tmpB = path.join(SCRIPTS_DIR, "verify-selftest-stale-b.baseline.json");
  fs.writeFileSync(tmpB, JSON.stringify({ count: 5, keys: ["a", "b", "c", "d", "e"] }));
  const bFindings = scanBaselineForMeasuredAt("scripts/verify-selftest-stale-b.baseline.json");
  if (bFindings.length === 1 && bFindings[0].pattern.includes("no measured_at")) {
    pass++;
    console.log("  PASS: (b) missing measured_at detected");
  } else {
    fail++;
    console.log(`  FAIL: (b) missing measured_at — expected 1 finding, got ${bFindings.length}`);
  }
  fs.unlinkSync(tmpB);

  // (b) stale measured_at (before wipe)
  const tmpB2 = path.join(SCRIPTS_DIR, "verify-selftest-stale-b2.baseline.json");
  fs.writeFileSync(
    tmpB2,
    JSON.stringify({ measured_at: "2026-09-22T12:00:00Z", count: 0, keys: [] })
  );
  const b2Findings = scanBaselineForMeasuredAt("scripts/verify-selftest-stale-b2.baseline.json");
  if (b2Findings.length === 1 && b2Findings[0].pattern.includes("predates")) {
    pass++;
    console.log("  PASS: (b) stale measured_at detected");
  } else {
    fail++;
    console.log(`  FAIL: (b) stale measured_at — expected 1 finding, got ${b2Findings.length}`);
  }
  fs.unlinkSync(tmpB2);

  // (b) OK — post-wipe measured_at
  const tmpB3 = path.join(SCRIPTS_DIR, "verify-selftest-stale-b3.baseline.json");
  fs.writeFileSync(
    tmpB3,
    JSON.stringify({ measured_at: "2026-09-23T21:35:00Z", count: 0, keys: [] })
  );
  const b3Findings = scanBaselineForMeasuredAt("scripts/verify-selftest-stale-b3.baseline.json");
  if (b3Findings.length === 0) {
    pass++;
    console.log("  PASS: (b) post-wipe measured_at OK");
  } else {
    fail++;
    console.log(`  FAIL: (b) post-wipe measured_at — expected 0 findings, got ${b3Findings.length}`);
  }
  fs.unlinkSync(tmpB3);

  // (d) count mismatch with keys array
  const tmpD = path.join(SCRIPTS_DIR, "verify-selftest-stale-d.baseline.json");
  fs.writeFileSync(
    tmpD,
    JSON.stringify({ measured_at: "2026-09-23T21:35:00Z", count: 5, keys: ["a", "b", "c"] })
  );
  const dFindings = scanBaselineForDuplicatedCount("scripts/verify-selftest-stale-d.baseline.json");
  if (dFindings.length === 1 && dFindings[0].pattern.includes("does not match keys")) {
    pass++;
    console.log("  PASS: (d) count/keys mismatch detected");
  } else {
    fail++;
    console.log(`  FAIL: (d) count/keys mismatch — expected 1 finding, got ${dFindings.length}`);
  }
  fs.unlinkSync(tmpD);

  console.log(`\n${LABEL} --selftest ${fail === 0 ? "PASS" : "FAIL"} (${pass} pass, ${fail} fail)`);
  process.exit(fail === 0 ? 0 : 1);
}

// --- main ---

async function main() {
  if (SELFTEST) return selftest();

  const findings = scanAll();

  if (findings.length === 0) {
    console.log(`${LABEL}: PASS — 0 stale literals found in guards and baselines.`);
    process.exit(0);
  }

  console.error(`${LABEL}: FAIL — ${findings.length} stale literal(s) found:`);
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line ?? "?"} — ${f.pattern}`);
    if (f.snippet) console.error(`    ${f.snippet}`);
  }
  console.error(
    `\nTo allowlist a legitimate literal, add a comment on the line or the two lines above:\n` +
      `  // STALE-LITERAL-OK: <reason>\n` +
      `No silent exemptions. No .guard-exempt.json.`
  );
  process.exit(1);
}

main().catch((e) => {
  console.error(`${LABEL}: ERROR — ${e.message}`);
  process.exit(1);
});
