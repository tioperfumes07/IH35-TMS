#!/usr/bin/env node
/**
 * GUARD: fail on NEW *affirmative* approval-hold language in active governance only.
 *
 * OWNER LAW 2026-08-03: NO HOLDS. NO JORGE-APPROVED. Coders FULL Neon + merge on green.
 *
 * Claude Coder correction (2026-08-04): Do NOT purge abolition sentences
 * ("NO HOLDS. NO JORGE-APPROVED") — those kill the gate. Do NOT rewrite
 * docs/audit, db/migrations, or .block-ready (WORM / never-delete / checksum freeze).
 *
 * This guard:
 *  - Scans active governance: .cursor/rules, .claude/skills, .windsurf/rules,
 *    .github/PULL_REQUEST_TEMPLATE.md, AGENTS.md, docs/CLAUDE.md, selected docs/specs.
 *  - FAILS only on *positive* hold instructions (wait for label, owner applies Neon, etc.).
 *  - ALLOWS negative/tombstone lines that abolish the label (baselined).
 *  - EXCLUDES docs/audit, docs/trackers, db/migrations, .block-ready (history = evidence).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-approval-holds";
const SELFTEST = process.argv.includes("--selftest");

/** Built so scanning this file never matches the literal in FORBIDDEN notes incorrectly. */
const TOKEN = ["JORGE", "APPROVED"].join("-");

/** Affirmative / resurrecting patterns only — not the law that kills the label. */
const FORBIDDEN = [
  {
    id: "require-label",
    re: new RegExp(
      String.raw`(?:require[sd]?|need[s]?|wait(?:ing)?\s+for|must\s+(?:have|get)|behind)\s+[^\n]{0,40}${TOKEN}|${TOKEN}\s+(?:required|before\s+merge|\+|label\s+before)`,
      "i",
    ),
    note: `affirmative ${TOKEN} requirement / wait`,
  },
  {
    id: "build-and-hold",
    re: /build-and-HOLD(?:\s+until)?/i,
    note: "build-and-HOLD (affirmative merge gate)",
  },
  {
    id: "hold-until-jorge",
    re: /HOLD until Jorge|Money\s*=\s*HOLD(?:\s+until)?|Money\/GL HOLD path|financial merge after Jorge/i,
    note: "HOLD-until-Jorge / Money=HOLD affirmative gate",
  },
  {
    id: "wait-owner-ok",
    re: /wait for (?:the )?owner(?:'s)? (?:explicit )?(?:OK|approval|sign-?off)(?: to merge)?/i,
    note: "wait for owner OK/approval to merge",
  },
  {
    id: "owner-applies-neon",
    re: /owner (?:Neon-)?apply(?:s|ing)?(?:\s+migrations?)?(?:\s+on Neon)?(?:\s+required)?|You:\s*Neon apply when required|owner applies on Neon/i,
    note: "owner applies on Neon (coders apply; owner does not)",
  },
  {
    id: "never-self-merge-financial",
    re: /NEVER self-merge(?:\s+a)?\s+migration|Never self-merge\. Never build finance|never self-merge.*financial cluster/i,
    note: "NEVER self-merge financial (affirmative; superseded)",
  },
  {
    id: "held-for-jorge",
    re: /HELD-FOR-JORGE|held for Jorge as a merge condition/i,
    note: "HELD-FOR-JORGE merge condition",
  },
];

/**
 * Negative / abolition lines — the law killing the label.
 * These MUST remain; the guard must not fire on them.
 */
function isAbolitionLine(line) {
  return (
    /NO\s+HOLDS/i.test(line) ||
    new RegExp(String.raw`NO\s+[^\n]{0,20}${TOKEN}`, "i").test(line) ||
    new RegExp(String.raw`${TOKEN}[^\n]{0,40}(?:is\s+)?(?:\*\*)?DELETED`, "i").test(line) ||
    /does\s+(?:\*\*)?not(?:\*\*)?\s+require/i.test(line) ||
    /does\s+not\s+review\s+PRs\s+for\s+a\s+label/i.test(line) ||
    /Never wait for/i.test(line) ||
    /do not wait/i.test(line) ||
    /Waiting on deleted/i.test(line) ||
    (/merge on green/i.test(line) && /no\s+(?:owner|approval|hold)/i.test(line)) ||
    /verify-no-approval-holds/i.test(line) ||
    /OWNER LAW\s*\(?\s*2026-08-03/i.test(line) ||
    /label is deleted, not optional/i.test(line) ||
    /SUPERSEDED|supersedes every earlier|older text below referencing|wording anywhere below/i.test(line) ||
    (/do not (?:wait|block) on/i.test(line) && new RegExp(TOKEN, "i").test(line)) ||
    /Asking for a label.*violation/i.test(line) ||
    /not an owner-approval gate/i.test(line) ||
    /proof.?gated.*NOT owner-approval/i.test(line) ||
    /Safeguard\s*=\s*\*\*PROOF/i.test(line) ||
    /"owner applies on Neon"|"self-merge only if non-financial"|\/ "owner applies/i.test(line) ||
    /Keep.*abolition|abolition sentences|positive-only ratchet|affirmative waits/i.test(line)
  );
}

const SCAN_FILES = [
  "AGENTS.md",
  "docs/CLAUDE.md",
  ".github/PULL_REQUEST_TEMPLATE.md",
  "docs/specs/DEFINITION-OF-DONE.md",
  "docs/specs/HOLD-MERGE-GATE.md",
  "docs/specs/CURSOR-OPERATING-CONSTITUTION.md",
  "docs/specs/PRE-BLOCK-OWNER-QUESTIONS-LAW-2026-07-26.md",
  "docs/specs/LAW-OF-THE-LAND-COMPLETE-2026-07-25.md",
  "docs/specs/EVERY-PR-AUDIT-CHECKLIST.md",
  "docs/specs/DELIVERY-METHOD-LOCKED.md",
  "docs/specs/PER-PR-CHECKLIST.md",
  "docs/lockdown/00_LOCKED_DECISIONS.md",
  "docs/specs/IH35-TMS-Operating-Doctrine-PERMANENT.md",
];

/** Explicit excludes (history / WORM / checksum freeze) — never scan even if linked. */
const EXCLUDE_PREFIXES = [
  "docs/audit/",
  "docs/trackers/",
  "docs/incidents/",
  "db/migrations/",
  ".block-ready/",
  "scripts/__fixtures__/",
];

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === ".git") continue;
      walk(p, acc);
    } else if (/\.(md|mdc|txt)$/i.test(ent.name)) {
      acc.push(p);
    }
  }
  return acc;
}

function isExcluded(rel) {
  const n = rel.replace(/\\/g, "/");
  return EXCLUDE_PREFIXES.some((p) => n.startsWith(p));
}

function governingFiles() {
  const out = new Set();
  for (const rel of SCAN_FILES) {
    const abs = path.join(ROOT, rel);
    if (fs.existsSync(abs) && !isExcluded(rel)) out.add(abs);
  }
  for (const d of [".claude/skills", ".cursor/rules", ".windsurf/rules"]) {
    for (const abs of walk(path.join(ROOT, d))) {
      const rel = path.relative(ROOT, abs);
      if (!isExcluded(rel)) out.add(abs);
    }
  }
  return [...out];
}

export function assertNoApprovalHolds(fileContents) {
  const problems = [];
  for (const abs of governingFiles()) {
    const rel = path.relative(ROOT, abs);
    const text = fileContents?.get?.(abs) ?? fileContents?.get?.(rel) ?? fs.readFileSync(abs, "utf8");
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (isAbolitionLine(line)) continue;
      // Migration firewall name is not an owner-approval hold.
      if (/hold-merge-gate|held-migrations|\.held-migrations/i.test(line) && !new RegExp(TOKEN, "i").test(line)) {
        continue;
      }
      for (const f of FORBIDDEN) {
        if (f.re.test(line)) {
          problems.push(`${rel}:${i + 1}: ${f.note} — "${line.trim().slice(0, 120)}"`);
        }
      }
    }
  }
  const law = path.join(ROOT, ".cursor/rules/00-operating-method-LAW.mdc");
  if (!fs.existsSync(law)) {
    problems.push(".cursor/rules/00-operating-method-LAW.mdc: missing");
  } else {
    const t = fs.readFileSync(law, "utf8");
    if (!/NO HOLDS/i.test(t) || !/merge on green/i.test(t)) {
      problems.push(".cursor/rules/00-operating-method-LAW.mdc: must state NO HOLDS + merge on green");
    }
    if (!/FULL Neon/i.test(t)) {
      problems.push(".cursor/rules/00-operating-method-LAW.mdc: must state FULL Neon access for coders");
    }
    // Abolition of the deleted label must remain visible (Coder: do not purge the law that kills it).
    if (!new RegExp(TOKEN, "i").test(t) && !/owner-approval merge label/i.test(t)) {
      problems.push(
        `.cursor/rules/00-operating-method-LAW.mdc: must name the deleted merge label (${TOKEN}) or equivalent abolition`,
      );
    }
  }
  return problems;
}

if (SELFTEST) {
  const lawRel = ".cursor/rules/00-operating-method-LAW.mdc";
  const abs = path.join(ROOT, lawRel);
  const base = fs.readFileSync(abs, "utf8");
  // Plant affirmative holds — must catch.
  const planted =
    base +
    `\nBad: WAIT for owner OK to merge and require ${TOKEN} before merge.\n` +
    `\nBad2: Money = HOLD until Jorge + Neon.\n` +
    `\nBad3: owner applies on Neon before merge.\n` +
    `\nBad4: financial cluster → build-and-HOLD. Owner ${TOKEN} required.\n`;
  const plantedProblems = [];
  for (const [i, line] of planted.split(/\r?\n/).entries()) {
    if (isAbolitionLine(line)) continue;
    for (const f of FORBIDDEN) {
      if (f.re.test(line)) plantedProblems.push(`${lawRel}:${i + 1}: ${f.note}`);
    }
  }
  if (plantedProblems.length < 3) {
    console.error(`${LABEL} SELFTEST FAIL — planted affirmative holds not caught (${plantedProblems.length})`);
    for (const p of plantedProblems) console.error(`  - ${p}`);
    process.exit(1);
  }
  // Plant abolition line — must NOT catch.
  const abolish = `NO HOLDS. NO ${TOKEN}. Coders merge on green.`;
  let falsePositive = false;
  if (!isAbolitionLine(abolish)) {
    for (const f of FORBIDDEN) {
      if (f.re.test(abolish)) falsePositive = true;
    }
  }
  if (falsePositive) {
    console.error(`${LABEL} SELFTEST FAIL — abolition line falsely flagged`);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST PASS — affirmative holds caught (${plantedProblems.length}); abolition lines allowed`,
  );
  process.exit(0);
}

const problems = assertNoApprovalHolds();
if (problems.length) {
  console.error(`${LABEL} FAIL — affirmative approval-hold language in active governance:\n`);
  for (const p of problems.slice(0, 80)) console.error(`  - ${p}`);
  if (problems.length > 80) console.error(`  … +${problems.length - 80} more`);
  console.error(
    `\nNote: abolition lines ("NO HOLDS. NO ${TOKEN}") are allowed. History under docs/audit, db/migrations, .block-ready is excluded.`,
  );
  process.exit(1);
}
console.log(
  `${LABEL} OK — no affirmative approval-hold language in active governance (abolition lines retained)`,
);
