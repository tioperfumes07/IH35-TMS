#!/usr/bin/env node
/**
 * GUARD: no affirmative approval-hold language in ACTIVE .block-ready work orders.
 *
 * OWNER LAW 2026-08-03 (reaffirmed by the owner in chat 2026-08-06: "there is no hold … all
 * questions have been asked and answered … never defer we always fix"): NO HOLDS. NO approval
 * label. Coders have full Neon access and merge on green. Proof, not approval, is the gate.
 *
 * WHY THIS EXISTS (found live 2026-08-06 by the CC-3 live-verifier lane):
 * `verify-no-approval-holds` (step 2218) deliberately EXCLUDES `.block-ready/` on the grounds that
 * it is history/evidence. That is true for COMPLETED blocks — but a block whose status is BUILD or
 * READY is not history, it is a LIVE WORK ORDER that a coder reads and follows. Fifteen such blocks
 * still carried dead law, including
 * `.block-ready/REVENUE-RECOGNITION-TWO-EVENT-LATCH-2026-07-19.json` (status BUILD) whose
 * acceptance[] read "Flag default OFF per-entity behind financial HOLD/JORGE-APPROVED + Neon proof
 * before enable". That criterion is FALSE against prod — verified on br-fancy-credit-akjnd07a
 * 2026-08-06: REVENUE_RECOGNITION_POST_ENABLED is already true for TRANSP and USMCA (false for TRK,
 * which is correct per the locked entity scope). A coder building that block to its own acceptance
 * criteria would have turned USMCA's posting flags OFF.
 *
 * SCOPE — deliberately narrow, so history stays WORM:
 *   - ONLY `.block-ready/*.json`.
 *   - ONLY blocks whose `status` is an ACTIVE status (BUILD / READY / PENDING / PARTIAL /
 *     NEEDS-VERIFY / DISPATCH). Completed/archived blocks are evidence and are skipped.
 *   - ONLY *affirmative* hold instructions. Tombstone / abolition sentences that RECORD the law
 *     ("no holds", "owner law 2026-08-03", "superseded_hold") are explicitly allowed — banning
 *     those would delete the very record that kills the label.
 *
 * This is the `.block-ready` companion to verify-no-approval-holds (2218) and
 * verify-no-stale-approval-gate. It does NOT touch docs/audit, docs/trackers, db/migrations or
 * _archived, and it does NOT touch the QBO write-back OFF guards — QBO write-back being OFF is
 * CURRENT law, not drift.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-hold-language-in-active-blocks";
const SELFTEST = process.argv.includes("--selftest");

/** Built at runtime so this file's own prose can never self-trip the scan. */
const LABEL_TOKEN = ["JORGE", "APPROVED"].join("-");
const HOLD_TOKEN = ["HOLD", "FOR", "JORGE"].join("-");

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
 * Affirmative hold instructions only. Each must be something a coder could ACT on
 * ("wait", "do not merge", "requires the label"), never a sentence that merely records
 * that holds are abolished.
 */
/**
 * TOKENS — bare labels. These legitimately appear inside abolition sentences
 * ("the JORGE-APPROVED label is abolished"), so a tombstone context MAY exempt them.
 */
const FORBIDDEN_TOKENS = [
  { re: new RegExp(LABEL_TOKEN, "i"), why: "the approval label is abolished (owner law 2026-08-03)" },
  { re: new RegExp(HOLD_TOKEN, "i"), why: "the hold label is abolished (owner law 2026-08-03)" },
  { re: /\bbuild-and-hold\b/i, why: "build-and-hold is abolished; build, prove live, merge on green" },
];

/**
 * INSTRUCTIONS — actionable directives a coder could obey. These are NEVER exemptable.
 *
 * HARDENED 2026-08-06 after this guard's own mutation test FAILED: the first version applied the
 * tombstone allowlist at LINE level, so appending "…owner law 2026-08-03 = no holds" to a live hold
 * instruction silently bypassed the guard. A real regression (or a lazy "fix") could have re-armed
 * a hold and stayed green. Instructions are now checked BEFORE, and independently of, any allowlist.
 */
const FORBIDDEN_INSTRUCTIONS = [
  { re: /\bfinancial\s+hold\b/i, why: "financial holds are abolished; the financial cluster merges on green" },
  { re: /\bdraft\s+hold\b/i, why: "draft-hold gating is abolished" },
  { re: /\bhold\s+for\s+(jorge|owner)\b/i, why: "the owner is not a merge gate" },
  { re: /never\s+self-merge/i, why: "coders merge on green in every lane" },
  { re: /do\s+not\s+merge\s+without\s+(?!ci\b|a\s+green|green\b)/i, why: "only CI-green may gate a merge" },
  { re: /wait\s+for\s+(the\s+)?(owner|jorge)[^.;,"]{0,40}(approval|label|ok|sign-?off)/i, why: "there is nothing to wait for; questions are answered up front" },
  { re: /must\s+remain\s+(a\s+)?draft\s+and\s+unmerged/i, why: "blocks are not parked as permanent drafts" },
  { re: /owner\s+(applies|runs|must\s+apply)\s+(the\s+)?neon/i, why: "coders apply Neon themselves (full access)" },
  { re: /behind\s+financial\s+hold/i, why: "nothing sits behind a financial hold" },
];

/** Sentences that RECORD the abolition — may exempt a bare TOKEN, never an INSTRUCTION. */
const ALLOWED_CONTEXT = [
  /\bis\s+abolished\b/i,
  /\babolish(ed|es|ing)?\b/i,
  /superseded_hold/i,
  /\bno\s+holds?\b/i,
  /owner\s+law\s+2026-08-03/i,
  /proof,?\s+not\s+approval/i,
];

function isTombstone(line) {
  return ALLOWED_CONTEXT.some((re) => re.test(line));
}

function scanBlob(text) {
  const findings = [];
  text.split(/\r?\n/).forEach((line, i) => {
    // 1. Actionable instructions are unconditional — an allowlist phrase cannot launder them.
    for (const { re, why } of FORBIDDEN_INSTRUCTIONS) {
      if (re.test(line)) {
        findings.push({ line: i + 1, why, excerpt: line.trim().slice(0, 160) });
        return;
      }
    }
    // 2. Bare labels are exempt only inside a genuine tombstone sentence.
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
  if (!s) return null;
  return ACTIVE_STATUSES.has(s) ? s : null;
}

function run() {
  const dir = path.join(ROOT, ".block-ready");
  if (!fs.existsSync(dir)) {
    console.log(`${LABEL} OK — no .block-ready directory`);
    return 0;
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const violations = [];
  let scanned = 0;

  for (const f of files) {
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
    if (!status) continue; // completed / archived / unknown => history, skip
    scanned += 1;
    const hits = scanBlob(raw);
    for (const h of hits) violations.push({ file: `.block-ready/${f}`, status, ...h });
  }

  if (violations.length > 0) {
    console.error(`${LABEL} — FAILED\n`);
    console.error(
      `${violations.length} affirmative approval-hold instruction(s) in ACTIVE .block-ready work orders.`
    );
    console.error(
      `OWNER LAW 2026-08-03: no holds, no approval label; coders have full Neon access and merge on green.\n`
    );
    for (const v of violations.slice(0, 40)) {
      console.error(`- ${v.file} (status ${v.status}) line ${v.line}: ${v.why}`);
      console.error(`    ${v.excerpt}`);
    }
    if (violations.length > 40) console.error(`  … and ${violations.length - 40} more`);
    console.error(
      `\nFix: state the live-verified truth instead. Tombstone sentences that RECORD the abolition ("no holds", "owner law 2026-08-03", "superseded_hold") are allowed and are not flagged.`
    );
    return 1;
  }

  console.log(
    `${LABEL} OK — ${scanned} active .block-ready work order(s) scanned, no affirmative approval-hold language (abolition/tombstone lines retained; completed blocks skipped as history)`
  );
  return 0;
}

function selftest() {
  const cases = [
    { name: "bare label token", text: `"note": "requires ${LABEL_TOKEN} before merge"`, expect: true },
    { name: "hold-for token", text: `"status": "${HOLD_TOKEN}"`, expect: true },
    { name: "financial hold", text: `"note": "FINANCIAL HOLD - do not merge"`, expect: true },
    { name: "never self-merge", text: `"note": "NEVER self-merge this block"`, expect: true },
    { name: "owner applies neon", text: `"note": "owner applies the Neon migration"`, expect: true },
    { name: "wait for owner approval", text: `"note": "wait for the owner approval"`, expect: true },
    { name: "tombstone is allowed", text: `"superseded_hold": "OWNER LAW 2026-08-03: no holds, no approval label"`, expect: false },
    { name: "abolition line allowed", text: `"note": "the ${LABEL_TOKEN} label is abolished"`, expect: false },
    { name: "CI-green gate allowed", text: `"note": "do not merge without CI green"`, expect: false },
    { name: "ordinary block text", text: `"task": "wire the poster and add a guard"`, expect: false },
    // Regression cases for the laundering bug this guard's own mutation test caught (2026-08-06).
    { name: "instruction + tombstone phrase cannot launder", text: `"check": "Flag default OFF behind financial HOLD/${LABEL_TOKEN}; owner law 2026-08-03 = no holds"`, expect: true },
    { name: "never-self-merge + 'no holds' cannot launder", text: `"note": "NEVER self-merge — no holds apply"`, expect: true },
    { name: "owner-applies-neon + abolished cannot launder", text: `"note": "owner applies the Neon migration; the label is abolished"`, expect: true },
  ];
  let failed = 0;
  for (const c of cases) {
    const got = scanBlob(c.text).length > 0;
    const ok = got === c.expect;
    if (!ok) failed += 1;
    console.log(`  ${ok ? "PASS" : "FAIL"} — ${c.name} (expected ${c.expect ? "flag" : "clean"}, got ${got ? "flag" : "clean"})`);
  }
  if (failed > 0) {
    console.error(`${LABEL} --selftest FAILED (${failed}/${cases.length})`);
    return 1;
  }
  console.log(`${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  return 0;
}

process.exit(SELFTEST ? selftest() : run());
