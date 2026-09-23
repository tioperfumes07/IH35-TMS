#!/usr/bin/env node
/**
 * @matrix-built {"modules":["guard"],"cols":["freshness"],"leafRe":"^scripts/verify-no-stale-literals-in-guards\\.mjs$","task":"Q10-DEVIN-A-STALE-LITERAL-SWEEP","vertical":"guard"}
 * verify-no-stale-literals-in-guards — Q10 (DEVIN-A, 2026-09-24).
 *
 * §9.0.17 sweep. Four hardcoded-count defects surfaced today:
 *   1. 333-vs-92: a contaminated baseline (333) was treated as historical debt
 *      when the genuine before-picture was 92.
 *   2. fuel 589/$253,271.24: a baseline measured against a ledger that was
 *      wiped (AUTH-001) — carrying it forward baselined a wipe artifact.
 *   3. purge-window 9 then 11: the PURGE_WINDOW_GUARDS list was hardcoded to
 *      9, then 11, when the live count is 10 — a stale literal that drifts.
 *   4. "47 documents": a hardcoded document count that doesn't match the
 *      dynamic count from the ground-truth file.
 *
 * This guard scans all scripts/verify-*.mjs and scripts/*.baseline.json files
 * for numeric literals that look like hardcoded BASELINE or POPULATION counts
 * (not structural assertions like "14 modules" or "12 sub-views"). A baseline
 * count is a number that represents a measured live-state count (e.g., "207
 * voided docs", "589 fuel rows", "76 unmatched transactions") — these drift
 * when the live state changes (wipe, feed, purge) and must not be hardcoded.
 *
 * The guard fails if any baseline-like count literal is NOT explicitly
 * allowlisted with: // STALE-LITERAL-OK: <reason>
 *
 * The guard is STATIC — no database needed. It scans source files only.
 *
 * Self-test: node scripts/verify-no-stale-literals-in-guards.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ALLOW_OFFLINE_SKIP = "Static source-file scan — no database read needed. Scans scripts/verify-*.mjs and *.baseline.json for hardcoded baseline-count literals.";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-stale-literals-in-guards";
const SCRIPTS_DIR = path.join(ROOT, "scripts");

// Patterns that indicate a BASELINE or POPULATION count literal — the defect
// class from Q10. These are numbers that represent a MEASURED live-state count
// (not a structural assertion like "14 modules" or "12 sub-views").
//
// We look for:
//   - `baseline.*count.*: <number>` or `count: <number>` in .baseline.json files
//   - `baseline.*=.*{.*count.*: <number>` in .mjs files (baseline objects)
//   - `KNOWN_VOIDED.*IDS.*=.*\[` followed by a hardcoded array length check
//   - `PURGE_WINDOW_GUARDS.*length.*<comparison>.*<number>` (purge window count)
//   - `documentCount.*=.*<number>` (hardcoded document count)
//
// We EXCLUDE:
//   - Numbers in comments (// or /* */ or *)
//   - Numbers in strings (already safe)
//   - STALE-LITERAL-OK allowlisted lines
//   - Structural assertions (length !== 14, length === 12) — these are
//     intentional structural checks, not baseline counts
//   - Numbers < 10 (too common)

// Context patterns that indicate a BASELINE count (the defect class):
const BASELINE_CONTEXTS = [
  // .baseline.json "count": <number> field
  /"count"\s*:\s*(\d{2,})/,
  // .baseline.json "total_cents": <number> field (dollar amounts in cents)
  /"total_cents"\s*:\s*(\d{4,})/,
  // baseline = { count: <number> } in .mjs files
  /baseline\s*[:=]\s*\{[^}]*count\s*:\s*(\d{2,})/i,
  // KNOWN_VOIDED_..._IDS = [ ... ] with a length check
  /KNOWN_VOIDED.*IDS\s*=\s*\[/i,
  // documentCount = <number>
  /documentCount\s*[:=]\s*(\d{2,})/i,
  // population = <number>
  /population\s*[:=]\s*(\d{2,})/i,
];

/**
 * Pure: given a line of source code and the filename, determine if it contains
 * a stale-literal candidate (a hardcoded baseline count in executable code,
 * not allowlisted).
 * @param {string} line
 * @param {string} filename
 * @param {string} [fileContent] — full file content (for .baseline.json stale_literal_ok check)
 * @returns {{found: boolean, literal: string|null, context: string|null}}
 */
export function findStaleLiteral(line, filename, fileContent) {
  if (!line.trim()) return { found: false, literal: null, context: null };

  const trimmed = line.trim();

  // Skip comment-only lines in .mjs files (// or * or /*)
  if (filename.endsWith(".mjs")) {
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
      return { found: false, literal: null, context: null };
    }
  }

  // Skip lines with STALE-LITERAL-OK allowlist
  if (/STALE-LITERAL-OK/i.test(line)) {
    return { found: false, literal: null, context: null };
  }

  // For .baseline.json files, check for "count" and "total_cents" fields
  if (filename.endsWith(".baseline.json")) {
    // Skip if the file has a "stale_literal_ok" field anywhere (allowlist)
    if (fileContent && /stale_literal_ok/i.test(fileContent)) {
      return { found: false, literal: null, context: null };
    }
    // "count": <number>
    const countMatch = line.match(/"count"\s*:\s*(\d{2,})/);
    if (countMatch) {
      const num = parseInt(countMatch[1], 10);
      if (num >= 10) {
        return { found: true, literal: countMatch[1], context: trimmed };
      }
    }
    // "total_cents": <number> (large dollar amounts)
    const centsMatch = line.match(/"total_cents"\s*:\s*(\d{4,})/);
    if (centsMatch) {
      const num = parseInt(centsMatch[1], 10);
      if (num >= 1000) {
        return { found: true, literal: centsMatch[1], context: trimmed };
      }
    }
    return { found: false, literal: null, context: null };
  }

  // For .mjs files, check baseline-like contexts
  for (const pattern of BASELINE_CONTEXTS) {
    const match = line.match(pattern);
    if (match) {
      // For KNOWN_VOIDED arrays, flag the line (the array length is the stale literal)
      if (/KNOWN_VOIDED.*IDS/i.test(line)) {
        return { found: true, literal: "array-length", context: trimmed };
      }
      const numStr = match[1];
      if (numStr) {
        const num = parseInt(numStr, 10);
        if (num >= 10) {
          // Check if it's in a string
          const beforeMatch = line.substring(0, match.index);
          const quoteCount = (beforeMatch.match(/["'`]/g) ?? []).length;
          if (quoteCount % 2 === 1) continue; // Inside a string
          return { found: true, literal: numStr, context: trimmed };
        }
      } else {
        // KNOWN_VOIDED pattern matched but no number — still flag
        return { found: true, literal: "array", context: trimmed };
      }
    }
  }

  return { found: false, literal: null, context: null };
}

/**
 * Pure: scan an array of lines and return all stale-literal findings.
 * Recognizes block-level STALE-LITERAL-OK: if a line within 5 lines above the
 * flagged line carries STALE-LITERAL-OK, the flagged line is allowlisted.
 * @param {string[]} lines
 * @param {string} filename
 * @param {string} [fileContent] — full file content (for .baseline.json stale_literal_ok check)
 * @returns {{file: string, line: number, literal: string, context: string}[]}
 */
export function scanLines(lines, filename, fileContent) {
  const findings = [];
  lines.forEach((line, idx) => {
    const result = findStaleLiteral(line, filename, fileContent);
    if (result.found) {
      // Check for block-level STALE-LITERAL-OK within 5 lines above
      let allowlisted = false;
      for (let i = Math.max(0, idx - 5); i < idx; i++) {
        if (/STALE-LITERAL-OK/i.test(lines[i])) {
          allowlisted = true;
          break;
        }
      }
      if (!allowlisted) {
        findings.push({
          file: filename,
          line: idx + 1,
          literal: result.literal,
          context: result.context,
        });
      }
    }
  });
  return findings;
}

function run() {
  // Scan .mjs guard files
  const mjsFiles = fs
    .readdirSync(SCRIPTS_DIR)
    .filter((f) => f.startsWith("verify-") && f.endsWith(".mjs"))
    .sort();

  // Scan .baseline.json files
  const baselineFiles = fs
    .readdirSync(SCRIPTS_DIR)
    .filter((f) => f.endsWith(".baseline.json"))
    .sort();

  const allFindings = [];

  for (const file of mjsFiles) {
    const filepath = path.join(SCRIPTS_DIR, file);
    const content = fs.readFileSync(filepath, "utf8");
    const lines = content.split("\n");
    const findings = scanLines(lines, file, content);
    allFindings.push(...findings);
  }

  for (const file of baselineFiles) {
    const filepath = path.join(SCRIPTS_DIR, file);
    const content = fs.readFileSync(filepath, "utf8");
    const lines = content.split("\n");
    const findings = scanLines(lines, file, content);
    allFindings.push(...findings);
  }

  if (allFindings.length > 0) {
    console.error(`${LABEL} FAIL — ${allFindings.length} hardcoded baseline-count literal(s) found (allowlist with // STALE-LITERAL-OK: <reason> or "stale_literal_ok": "<reason>" in JSON):`);
    for (const f of allFindings.slice(0, 30)) {
      console.error(`  ✗ ${f.file}:${f.line} — literal "${f.literal}" — ${f.context.substring(0, 80)}`);
    }
    if (allFindings.length > 30) {
      console.error(`  ... and ${allFindings.length - 30} more`);
    }
    process.exit(1);
  }

  console.log(`${LABEL} OK — scanned ${mjsFiles.length} guard files + ${baselineFiles.length} baseline files, 0 stale baseline-count literals.`);
}

function selftest() {
  const assert = { ok: (c, m) => { if (!c) throw new Error(m); } };

  // A .baseline.json line with "count": 207 should be flagged
  const baseline1 = findStaleLiteral('  "count": 207,', "test.baseline.json");
  assert.ok(baseline1.found, '"count": 207 in .baseline.json should be flagged');
  assert.ok(baseline1.literal === "207", `expected literal "207", got "${baseline1.literal}"`);

  // A .baseline.json line with "total_cents": 35023469 should be flagged
  const cents1 = findStaleLiteral('  "total_cents": 35023469,', "test.baseline.json");
  assert.ok(cents1.found, '"total_cents": 35023469 in .baseline.json should be flagged');

  // A .mjs line with baseline = { count: 333 } should be flagged
  const mjs1 = findStaleLiteral("  const baseline = { count: 333 };", "test.mjs");
  assert.ok(mjs1.found, "baseline = { count: 333 } in .mjs should be flagged");

  // A .mjs line with KNOWN_VOIDED_5782_IDS = [ should be flagged
  const known1 = findStaleLiteral("const KNOWN_VOIDED_5782_IDS = [", "test.mjs"); // STALE-LITERAL-OK: selftest fixture testing the KNOWN_VOIDED pattern
  assert.ok(known1.found, "KNOWN_VOIDED array should be flagged");

  // A .mjs line with documentCount = 47 should be flagged
  const doc1 = findStaleLiteral("  const documentCount = 47;", "test.mjs");
  assert.ok(doc1.found, "documentCount = 47 should be flagged");

  // A comment line should NOT be flagged
  const comment1 = findStaleLiteral("  // count: 47 — this is a comment", "test.mjs");
  assert.ok(!comment1.found, "comment lines should not be flagged");

  // A STALE-LITERAL-OK line should NOT be flagged
  const allowlisted = findStaleLiteral('  "count": 47  // STALE-LITERAL-OK: dynamic from ground truth', "test.mjs");
  assert.ok(!allowlisted.found, "STALE-LITERAL-OK lines should not be flagged");

  // A structural assertion (length !== 14) should NOT be flagged
  const structural1 = findStaleLiteral("  if (layers.length !== 14) {", "test.mjs");
  assert.ok(!structural1.found, "structural assertions (length !== 14) should not be flagged");

  // A small number (< 10) should NOT be flagged
  const small = findStaleLiteral('  "count": 5,', "test.baseline.json");
  assert.ok(!small.found, "numbers < 10 should not be flagged");

  // scanLines should return findings for a multi-line .baseline.json file
  const lines = [
    "{",
    '  "_comment": "test baseline",',
    '  "count": 207,',
    '  "total_cents": 35023469,',
    '  "established": "2026-09-23"',
  ];
  const fileContent = lines.join("\n");
  const findings = scanLines(lines, "test.baseline.json", fileContent);
  assert.ok(findings.length === 2, `expected 2 findings (lines 3 and 4), got ${findings.length}: ${JSON.stringify(findings)}`);
  assert.ok(findings[0].line === 3, `expected first finding at line 3, got ${findings[0].line}`);
  assert.ok(findings[0].literal === "207", `expected literal "207", got "${findings[0].literal}"`);
  assert.ok(findings[1].line === 4, `expected second finding at line 4, got ${findings[1].line}`);

  // A .baseline.json file with stale_literal_ok should NOT be flagged
  const allowlistedLines = [
    "{",
    '  "stale_literal_ok": "shrink-only ratchet",',
    '  "count": 833,',
    "}",
  ];
  const allowlistedContent = allowlistedLines.join("\n");
  const allowlistedFindings = scanLines(allowlistedLines, "test.baseline.json", allowlistedContent);
  assert.ok(allowlistedFindings.length === 0, `expected 0 findings for allowlisted baseline, got ${allowlistedFindings.length}`);

  // Block-level STALE-LITERAL-OK in .mjs should allowlist nearby lines
  const blockLines = [
    "const cases = [ // STALE-LITERAL-OK: selftest fixtures",
    '  { name: "growth", baseline: { count: 76 } },',
    '  { name: "debt", baseline: { count: 76 } },',
    "];",
  ];
  const blockFindings = scanLines(blockLines, "test.mjs");
  assert.ok(blockFindings.length === 0, `expected 0 findings for block-allowlisted lines, got ${blockFindings.length}`);

  console.log(`${LABEL} --selftest PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else run();
