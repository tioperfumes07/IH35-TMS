#!/usr/bin/env node
/** @independent-input .block-ready/ — checks block artifacts against the separate language law. */
/**
 * GUARD: no affirmative DEFER / PATCH instructions in ACTIVE work orders.
 *
 * OWNER LAW 2026-08-07 (Jorge, verbatim): "WE NEVER GUESS. WE NEVER DEFER. WE ALWAYS VERIFY. WE ALWAYS
 * FIX, NOT PATCH. WE WANT PERMANENT FIXES ALWAYS." Canonical text:
 * docs/law/NEVER-GUESS-NEVER-DEFER-ALWAYS-VERIFY-ALWAYS-FIX.md
 *
 * WHY THIS FILE EXISTS AT ALL: the repo's own LAW-2026-08-05-B2 says "LAW = ENFORCED GUARD, OR IT IS NOT
 * LAW." Writing the owner's rule as prose and stopping there would have been — precisely — a patch. So
 * the rule ships with the check that makes it real.
 *
 * WHAT IT ENFORCES: a block whose status is ACTIVE (BUILD/READY/PENDING/…) is a LIVE WORK ORDER that a
 * coder reads and obeys. If it instructs the coder to defer a root cause, ship a stopgap, or come back
 * later, that instruction will be followed. Those instructions are banned.
 *
 * SCOPE — deliberately narrow, so history stays WORM and the guard cannot false-fail:
 *   - ONLY `.block-ready/*.json`.
 *   - ONLY ACTIVE statuses. Completed/archived blocks are EVIDENCE and are skipped — rewriting history
 *     to satisfy a new law is itself a patch.
 *   - ONLY *affirmative instructions*. Prose that RECORDS the law, honest UNVERIFIED disclosures, and
 *     owner-written tracker deferrals are explicitly ALLOWED — banning those would delete the very
 *     record that makes the law legible, and would punish the honesty the law demands.
 *
 * DESIGN NOTE (learned the hard way in this repo, 2026-08-06): an allowlist applied at LINE level lets a
 * violation be laundered by appending an approved phrase to it. So ALLOWED context is checked ONLY for
 * the soft TOKEN class and is never consulted for the hard INSTRUCTION class.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-patch-or-defer-language";
const LAW = "docs/law/NEVER-GUESS-NEVER-DEFER-ALWAYS-VERIFY-ALWAYS-FIX.md";
const SELFTEST = process.argv.includes("--selftest");

/** A block with one of these statuses is a LIVE work order, not history. */
const ACTIVE_STATUSES = new Set([
  "BUILD",
  "READY",
  "PENDING",
  "PARTIAL",
  "NEEDS-VERIFY",
  "DISPATCH",
  "IN-PROGRESS",
]);

/**
 * HARD INSTRUCTIONS — actionable directives to defer or patch. NEVER exemptable: no surrounding phrase
 * can make "ship now, fix later" acceptable in a live work order.
 */
const FORBIDDEN_INSTRUCTIONS = [
  { re: /\btodo\s*:?\s*fix\s+(it\s+)?later\b/i, why: "the root cause is fixed now, not later" },
  { re: /\bfix\s+(it\s+)?(later|in\s+a\s+follow-?up)\b/i, why: "deferring a known defect is forbidden" },
  { re: /\bship\s+(it\s+)?(now|first)\b[^.;]{0,40}\bfix\b/i, why: "ship-now-fix-later is the defer pattern" },
  { re: /\btemporary\s+(patch|workaround|fix|hack)\b/i, why: "temporary fixes become permanent defects" },
  { re: /\b(band-?aid|stop-?gap)\b/i, why: "a stopgap is a patch by another name" },
  { re: /\bpatch\s+over\b/i, why: "patching over a root cause is forbidden" },
  { re: /\bfor\s+now,?\s+(just|simply)\b/i, why: "\"for now\" is deferral" },
  { re: /\bdefer(ring)?\s+the\s+root\s+cause\b/i, why: "the root cause is never deferred" },
  { re: /\bgood\s+enough\s+for\s+now\b/i, why: "the standard is complete and permanent, not good enough" },
  { re: /\bci[- ]green\s+is\s+enough\b/i, why: "CI-green is the floor, not the verdict" },
  { re: /\bwe('| a)?ll\s+(fix|handle|address)\s+(that|it|this)\s+later\b/i, why: "deferring a known defect is forbidden" },
];

/**
 * SOFT TOKENS — words that legitimately appear inside sentences RECORDING the law
 * ("no patches", "this is not a workaround"). A genuine tombstone MAY exempt these; an instruction never.
 */
const FORBIDDEN_TOKENS = [
  { re: /\bhack\b/i, why: "a hack is not a permanent fix" },
  { re: /\bquick\s+fix\b/i, why: "a quick fix is a patch" },
];

/** Sentences that RECORD the law (or honestly disclose a gap) — may exempt a soft TOKEN only. */
const ALLOWED_CONTEXT = [
  /\bnever\s+(patch|defer|guess)\b/i,
  /\bno\s+(patches|patching|stopgaps?)\b/i,
  /\bcomplete\s+and\s+permanent\b/i,
  /\bpermanent\s+fix\b/i,
  /owner\s+law\s+2026-08-07/i,
  /\bis\s+abolished\b/i,
  /\bUNVERIFIED\b/,
  /\bnot\s+a\s+(workaround|patch|hack)\b/i,
];

const isTombstone = (line) => ALLOWED_CONTEXT.some((re) => re.test(line));

export function scanBlob(text) {
  const findings = [];
  text.split(/\r?\n/).forEach((line, i) => {
    for (const { re, why } of FORBIDDEN_INSTRUCTIONS) {
      if (re.test(line)) {
        findings.push({ line: i + 1, why, excerpt: line.trim().slice(0, 160) });
        return;
      }
    }
    if (isTombstone(line)) return;
    for (const { re, why } of FORBIDDEN_TOKENS) {
      if (re.test(line)) {
        findings.push({ line: i + 1, why, excerpt: line.trim().slice(0, 160) });
        return;
      }
    }
  });
  return findings;
}

function activeStatusOf(json) {
  const s = typeof json?.status === "string" ? json.status.trim().toUpperCase() : null;
  return s && ACTIVE_STATUSES.has(s) ? s : null;
}

function run() {
  if (!fs.existsSync(path.join(ROOT, LAW))) {
    console.error(`${LABEL} — FAILED\n\nThe law this guard enforces is missing: ${LAW}`);
    console.error(`An enforced law whose source text is gone is unciteable. Restore it or deregister the law.`);
    return 1;
  }
  const dir = path.join(ROOT, ".block-ready");
  if (!fs.existsSync(dir)) {
    console.log(`${LABEL} OK — no .block-ready directory`);
    return 0;
  }
  const violations = [];
  let scanned = 0;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const full = path.join(dir, f);
    let raw;
    try {
      raw = fs.readFileSync(full, "utf8");
    } catch {
      continue;
    }
    let json;
    try {
      json = JSON.parse(raw);
    } catch {
      continue; // malformed JSON is another guard's problem
    }
    const status = activeStatusOf(json);
    if (!status) continue;
    scanned += 1;
    for (const h of scanBlob(raw)) violations.push({ file: `.block-ready/${f}`, status, ...h });
  }

  if (violations.length) {
    console.error(`${LABEL} — FAILED\n`);
    console.error(`${violations.length} defer/patch instruction(s) in ACTIVE work orders.`);
    console.error(`OWNER LAW 2026-08-07: never guess, never defer, always verify, always FIX — not patch.\n`);
    for (const v of violations.slice(0, 40)) {
      console.error(`- ${v.file} (status ${v.status}) line ${v.line}: ${v.why}`);
      console.error(`    ${v.excerpt}`);
    }
    if (violations.length > 40) console.error(`  … and ${violations.length - 40} more`);
    console.error(`\nCanonical law: ${LAW}`);
    console.error(`Fix the root cause in the block instead. Sentences that RECORD the law, honest UNVERIFIED`);
    console.error(`disclosures, and owner-written tracker deferrals are allowed and are not flagged.`);
    return 1;
  }
  console.log(
    `${LABEL} OK — ${scanned} active .block-ready work order(s) scanned, no defer/patch instructions ` +
      `(law-recording lines and honest UNVERIFIED disclosures retained; completed blocks skipped as history)`
  );
  return 0;
}

function selftest() {
  const cases = [
    { name: "todo fix later", text: `"note": "TODO: fix later once the poster lands"`, expect: true },
    { name: "ship now fix later", text: `"note": "ship it now and fix isolation later"`, expect: true },
    { name: "temporary workaround", text: `"note": "temporary workaround until CC-1 wires the latch"`, expect: true },
    { name: "stopgap", text: `"note": "stop-gap until the real engine exists"`, expect: true },
    { name: "patch over", text: `"note": "patch over the 500 for the demo"`, expect: true },
    { name: "for now just", text: `"check": "for now, just skip the reversal"`, expect: true },
    { name: "ci green is enough", text: `"note": "CI-green is enough for this block"`, expect: true },
    { name: "good enough for now", text: `"note": "good enough for now"`, expect: true },
    { name: "law-recording line allowed", text: `"note": "OWNER LAW 2026-08-07: we never patch — complete and permanent fix only"`, expect: false },
    { name: "honest UNVERIFIED allowed", text: `"note": "UNVERIFIED — needs live check before any code change"`, expect: false },
    { name: "not-a-workaround allowed", text: `"note": "this is not a workaround; the root cause is corrected at source"`, expect: false },
    { name: "ordinary block text", text: `"task": "wire the poster and add a guard"`, expect: false },
    // Laundering regressions — an approved phrase must NOT rescue a hard instruction.
    { name: "instruction + law phrase cannot launder", text: `"note": "TODO: fix later — owner law 2026-08-07 permanent fix"`, expect: true },
    { name: "instruction + UNVERIFIED cannot launder", text: `"note": "ship it now and fix later; UNVERIFIED"`, expect: true },
    { name: "soft token IS exemptable in a tombstone", text: `"note": "no patches: a quick fix is never acceptable here"`, expect: false },
    { name: "soft token alone is flagged", text: `"note": "apply a quick fix to the resolver"`, expect: true },
  ];
  let failed = 0;
  for (const c of cases) {
    const got = scanBlob(c.text).length > 0;
    const ok = got === c.expect;
    if (!ok) failed += 1;
    console.log(`  ${ok ? "PASS" : "FAIL"} — ${c.name} (expected ${c.expect ? "flag" : "clean"}, got ${got ? "flag" : "clean"})`);
  }
  if (!fs.existsSync(path.join(ROOT, LAW))) {
    console.log(`  FAIL — canonical law file missing: ${LAW}`);
    failed += 1;
  } else {
    console.log(`  PASS — canonical law file present`);
  }
  if (failed) {
    console.error(`${LABEL} --selftest FAILED (${failed}/${cases.length + 1})`);
    return 1;
  }
  console.log(`${LABEL} --selftest PASS (${cases.length + 1}/${cases.length + 1})`);
  return 0;
}

process.exit(SELFTEST ? selftest() : run());
