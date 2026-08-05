#!/usr/bin/env node
/**
 * GUARD: no stale CPA / posting-flags-OFF gate language in ACTIVE law files.
 *
 * Companion to verify-no-approval-holds (step 2218), which catches affirmative *approval holds*
 * ("wait for the label", "owner applies Neon"). It did NOT catch the other half of the same class:
 * a law file asserting money-posting flags are OFF pending a CPA / accountant tie-out.
 *
 * WHY THIS EXISTS (found + proved live 2026-08-05):
 * `.claude/skills/ih35-tms-standards/SKILL.md` §6 — the skill that AUTO-LOADS at every session boot —
 * stated "money-posting flags default OFF until CPA + Neon tie-out". That is false against prod and
 * contradicts the owner law in three other active files (DELIVERY-METHOD-LOCKED.md §Phase 4 "There is
 * no CPA. There is no CPA HOLD path."; .cursor/rules/11 "There is no CPA sign-off in this system.";
 * 00_LOCKED_DECISIONS.md §9.9 "not a CPA gate"). Verified on Neon br-fancy-credit-akjnd07a:
 * org.companies TRANSP/TRK/USMCA all is_active=true; lib.feature_flag_overrides enabled posting flags
 * = 22 / 21 / 22; QBO_JE_PUSH_ENABLED + QBO_ENTITY_PUSH_ENABLED enabled = 0 / 0 / 0. So posting is ON
 * and only QBO write-back is OFF — the inverse of what the skill told every agent at boot.
 *
 * SCOPE (owner instruction): ACTIVE law only. History and evidence are WORM and excluded —
 * docs/trackers, docs/audit, db/migrations, .block-ready, _archived. The correct
 * verify-qbo-*flags*off* guards are NOT touched: QBO write-back being OFF is current law, not drift.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-stale-approval-gate";

/** Active law files only. A stale gate here misinforms every agent at boot. */
const ACTIVE_LAW_GLOBS = [
  ".claude/skills",
  ".cursor/rules",
  ".windsurf/rules",
  "AGENTS.md",
  "docs/CLAUDE.md",
  "docs/specs/DELIVERY-METHOD-LOCKED.md",
  "docs/specs/STANDING-SESSION-DIRECTIVE.md",
];

/** History / evidence — never rewritten (WORM, checksum freeze, never-delete). */
const EXCLUDED = ["docs/trackers", "docs/audit", "db/migrations", ".block-ready", "_archived", "node_modules"];

/**
 * Affirmative STALE-GATE patterns: money posting gated on a CPA/accountant.
 * Abolition sentences ("There is no CPA", "not a CPA gate") must NOT match — deleting those would
 * remove the law that kills the gate, the exact mistake Rev D made with the hold tokens.
 */
const FORBIDDEN = [
  /flags?\s+(?:default\s+)?off\s+until\s+CPA/i,
  /posting\s+flags?[^.\n]{0,40}\buntil\b[^.\n]{0,30}\b(?:CPA|accountant)\b/i,
  /\bgated\b[^.\n]{0,30}\buntil\b[^.\n]{0,20}\b(?:CPA|accountant)\b/i,
  /\b(?:await|awaiting|pending|wait for)\s+CPA\b/i,
  /CPA\s+(?:sign-?off|tie-?out|approval)\s+(?:required|needed|before)/i,
];

/**
 * Abolition context — a line that KILLS the gate is the law and must survive.
 * Deliberately NARROW and gate-specific. A generic /\bno\b/ was the first version and it failed open
 * on the very defect this guard exists for: the real SKILL.md line contains "NO write-back", so a
 * generic negation test skipped it. Match only phrasing that negates or supersedes the CPA gate.
 */
const ABOLITION =
  /(?:there is no cpa|no cpa\b|not a cpa gate|retire every|supersed|no longer|\bstale\b|was wrong|abolish|retired)/i;

/** A phrase inside backticks is a quoted token in a "retire these" list, not an instruction. */
function matchIsBackticked(line, matchText) {
  const idx = line.indexOf(matchText);
  if (idx < 0) return false;
  const before = line.slice(0, idx);
  const after = line.slice(idx + matchText.length);
  return /`[^`]*$/.test(before) && /^[^`]*`/.test(after);
}

export function auditText(text, file = "<mem>") {
  const problems = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const re of FORBIDDEN) {
      const m = re.exec(line);
      if (!m) continue;
      // An abolition/correction sentence is the law, not the drift — keep it.
      if (ABOLITION.test(line)) continue;
      // A backticked phrase inside a "retire these gates" enumeration is not a live gate.
      if (matchIsBackticked(line, m[0])) continue;
      problems.push(
        `${file}:${i + 1}: stale CPA/posting-flag gate — "${line.trim().slice(0, 120)}". ` +
          `Posting flags are ON for all three entities; only QBO write-back is OFF. There is no CPA gate. ` +
          `State the current law, or mark the line explicitly superseded.`
      );
      break;
    }
  }
  return problems;
}

function walk(rel, out) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return;
  if (EXCLUDED.some((x) => rel.includes(x))) return;
  const st = fs.statSync(abs);
  if (st.isDirectory()) {
    for (const entry of fs.readdirSync(abs)) walk(path.join(rel, entry), out);
    return;
  }
  if (/\.(md|mdc)$/i.test(rel)) out.push(rel);
}

function auditTree() {
  const files = [];
  for (const g of ACTIVE_LAW_GLOBS) walk(g, files);
  if (files.length === 0) return [`${LABEL}: no active law files found — scope is wrong, refusing to pass vacuously.`];
  const problems = [];
  for (const rel of files) {
    // Never scan this guard's own FORBIDDEN table.
    if (rel.endsWith("verify-no-stale-approval-gate.mjs")) continue;
    problems.push(...auditText(fs.readFileSync(path.join(ROOT, rel), "utf8"), rel));
  }
  return problems;
}

function selftest() {
  const failures = [];

  // The exact pre-fix sentence from SKILL.md §6 — MUST fail, or this guard is decorative.
  const preFix =
    "system-of-record; CLONE-ONCE + RECONCILE-ONLY; NO write-back; money-posting flags default OFF until CPA + Neon\ntie-out.";
  if (auditText(preFix).length === 0) failures.push("case1 FAIL — the real pre-fix SKILL.md line was NOT caught");

  // Abolition lines are the law — they must survive.
  if (auditText("There is no CPA. There is no CPA HOLD path.").length !== 0)
    failures.push("case2 FAIL — an abolition sentence was flagged (deleting it would restore the gate)");
  if (auditText("posting-flag enablement is the OWNER's call, not a CPA gate").length !== 0)
    failures.push("case3 FAIL — a correction sentence was flagged");
  if (auditText("This supersedes the 2026-07-04 \"SETTLEMENT + LEASE OFF until CPA\" line").length !== 0)
    failures.push("case4 FAIL — an explicit supersession record was flagged");

  // QBO write-back being OFF is CURRENT law, not drift — must not trip.
  if (auditText("QBO_JE_PUSH_ENABLED and QBO_ENTITY_PUSH_ENABLED stay OFF (default OFF, per-entity only).").length !== 0)
    failures.push("case5 FAIL — current QBO write-back law was flagged as stale");

  // Other affirmative shapes.
  if (auditText("Money posting stays gated until CPA tie-out completes.").length === 0)
    failures.push("case6 FAIL — an affirmative 'until CPA tie-out' gate was NOT caught");

  const tree = auditTree();
  if (tree.length !== 0) failures.push(`case7 FAIL — real active law flagged: ${tree.join(" | ")}`);

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(
    `${LABEL}: selftest PASS — real pre-fix line caught, abolition/supersession lines preserved, ` +
      `current QBO write-back law untouched`
  );
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — no stale CPA / posting-flags-OFF gate language in active law`);
}

main();
