#!/usr/bin/env node
/**
 * GUARD: no approval-hold / owner-merge-label language in governing agent-read files.
 *
 * OWNER LAW 2026-08-03: NO HOLDS. NO owner-approval merge label.
 * Coders have FULL Neon access and MERGE ON GREEN with proof.
 * Safeguard = PROOF (migration firewall + independent review + GUARD after), not a label.
 *
 * Scans living law agents load every session. Does NOT scan dated trackers / AUDIT ledger history.
 * Ratchet: any reintroduction of the deleted merge-label token or affirmative hold language FAILS CI.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-approval-holds";
const SELFTEST = process.argv.includes("--selftest");

/** Constructed so this file's source is not itself a false positive if ever scanned. */
const DELETED_LABEL_TOKEN = ["JORGE", "APPROVED"].join("-");

const FORBIDDEN = [
  {
    id: "deleted-owner-merge-label-token",
    re: new RegExp(DELETED_LABEL_TOKEN, "i"),
    note: `${DELETED_LABEL_TOKEN} token (deleted merge label — do not reintroduce)`,
  },
  {
    id: "build-and-hold",
    re: /build-and-HOLD/i,
    note: "build-and-HOLD (use merge-on-green with proof)",
  },
  {
    id: "hold-until-jorge",
    re: /HOLD until Jorge|Money\s*=\s*HOLD|Money\/GL HOLD|financial merge after Jorge/i,
    note: "HOLD-until-Jorge / Money=HOLD merge gate",
  },
  {
    id: "wait-owner-ok",
    re: /wait for (?:the )?owner(?:'s)? (?:explicit )?(?:OK|approval|sign-?off)(?: to merge)?/i,
    note: "wait for owner OK/approval to merge",
  },
  {
    id: "owner-applies-neon",
    re: /owner applies (?:migrations? )?on Neon|ask (?:the owner )?before each (?:Neon|prod DB) connection|Neon apply when required.*[Oo]wner|You:\s*Neon apply/i,
    note: "owner applies on Neon (coders apply; owner does not)",
  },
  {
    id: "never-self-merge-migration",
    re: /NEVER self-merge (?:a )?migration|never self-merge.*financial|Never self-merge\. Never build finance/i,
    note: "NEVER self-merge migration/financial (superseded — merge on green with proof)",
  },
  {
    id: "held-for-jorge",
    re: /HELD-FOR-JORGE|held for Jorge as a merge condition|build-and-HOLD until/i,
    note: "HELD-FOR-JORGE merge condition",
  },
];

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

function governingFiles() {
  const out = new Set();
  for (const rel of SCAN_FILES) {
    const abs = path.join(ROOT, rel);
    if (fs.existsSync(abs)) out.add(abs);
  }
  for (const d of [".claude/skills", ".cursor/rules", ".windsurf/rules"]) {
    for (const abs of walk(path.join(ROOT, d))) out.add(abs);
  }
  return [...out];
}

/**
 * Zero-tolerance on the deleted merge-label token.
 * Other patterns: allow only lines that are clearly documenting the ban
 * without re-stating an approval gate (kept narrow on purpose).
 */
function isAllowlistedLine(line, forbiddenId) {
  if (forbiddenId === "deleted-owner-merge-label-token") return false;
  // Migration firewall filename / workflow name is not an owner-approval hold.
  if (/hold-merge-gate|held-migrations|\.held-migrations/i.test(line) && !/JORGE|owner.?approv|wait for owner/i.test(line)) {
    return true;
  }
  return false;
}

export function assertNoApprovalHolds(fileContents /* Map<path, text> optional */) {
  const problems = [];
  const files = governingFiles();
  for (const abs of files) {
    const rel = path.relative(ROOT, abs);
    const text = fileContents?.get?.(abs) ?? fileContents?.get?.(rel) ?? fs.readFileSync(abs, "utf8");
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const f of FORBIDDEN) {
        if (isAllowlistedLine(line, f.id)) continue;
        if (f.re.test(line)) {
          problems.push(`${rel}:${i + 1}: ${f.note} — "${line.trim().slice(0, 120)}"`);
        }
      }
    }
  }
  const law = path.join(ROOT, ".cursor/rules/00-operating-method-LAW.mdc");
  if (!fs.existsSync(law)) {
    problems.push(".cursor/rules/00-operating-method-LAW.mdc: missing — operating method law required");
  } else {
    const t = fs.readFileSync(law, "utf8");
    if (!/DRAIN_PROOF/i.test(t) || !/Execution & speed/i.test(t)) {
      problems.push(".cursor/rules/00-operating-method-LAW.mdc: must include Execution & speed + DRAIN_PROOF amendment");
    }
    if (!/NO HOLDS/i.test(t) || !/merge on green/i.test(t)) {
      problems.push(".cursor/rules/00-operating-method-LAW.mdc: must state NO HOLDS + merge on green");
    }
    if (!/FULL Neon/i.test(t)) {
      problems.push(".cursor/rules/00-operating-method-LAW.mdc: must state FULL Neon access for coders");
    }
  }
  return problems;
}

if (SELFTEST) {
  const lawRel = ".cursor/rules/00-operating-method-LAW.mdc";
  const abs = path.join(ROOT, lawRel);
  const plantedText =
    fs.readFileSync(abs, "utf8") +
    `\nBad: WAIT for owner OK to merge and apply ${DELETED_LABEL_TOKEN}.\n` +
    `\nBad2: Money = HOLD until Jorge + Neon.\n` +
    `\nBad3: owner applies on Neon before merge.\n`;
  const problems = [];
  const lines = plantedText.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const f of FORBIDDEN) {
      if (isAllowlistedLine(line, f.id)) continue;
      if (f.re.test(line)) problems.push(`${lawRel}:${i + 1}: ${f.note}`);
    }
  }
  if (problems.length < 3) {
    console.error(`${LABEL} SELFTEST FAIL — planted hold language not fully caught (${problems.length})`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — planted hold language caught (${problems.length})`);
  process.exit(0);
}

const problems = assertNoApprovalHolds();
if (problems.length) {
  console.error(`${LABEL} FAIL — approval-hold language in governing files:\n`);
  for (const p of problems.slice(0, 80)) console.error(`  - ${p}`);
  if (problems.length > 80) console.error(`  … +${problems.length - 80} more`);
  process.exit(1);
}
console.log(
  `${LABEL} OK — governing files have no approval-hold / ${DELETED_LABEL_TOKEN} merge language`,
);
