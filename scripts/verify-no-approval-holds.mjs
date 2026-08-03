#!/usr/bin/env node
/**
 * GUARD: no approval-hold / JORGE-APPROVED merge language in governing agent-read files.
 *
 * OWNER LAW 2026-08-03: NO HOLDS. NO JORGE-APPROVED. Full Neon + merge on green.
 * Safeguard = PROOF (firewall + GUARD after), not a label.
 *
 * Scans: .claude/skills/**, .cursor/rules/**, .windsurf/rules/**,
 *         .github/PULL_REQUEST_TEMPLATE.md, AGENTS.md, docs/CLAUDE.md,
 *         selected docs/specs governance files.
 * Does NOT scan WORM history (docs/blocks, dated trackers, AUDIT-COVERAGE-LIVE).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-approval-holds";
const SELFTEST = process.argv.includes("--selftest");

const FORBIDDEN = [
  { id: "JORGE-APPROVED-require", re: /JORGE-APPROVED/i, note: "JORGE-APPROVED label/requirement" },
  {
    id: "wait-owner-ok",
    re: /wait for (?:the )?owner(?:'s)? (?:explicit )?(?:OK|approval|sign-?off)/i,
    note: "wait for owner OK/approval",
  },
  {
    id: "owner-applies-neon",
    re: /owner applies (?:migrations? )?on Neon|ask (?:the owner )?before each (?:Neon|prod DB) connection|prod DB access is gated/i,
    note: "owner applies on Neon / gated prod DB",
  },
  {
    id: "never-self-merge-migration",
    re: /NEVER self-merge (?:a )?migration|never self-merge.*financial/i,
    note: "NEVER self-merge migration/financial",
  },
  {
    id: "held-for-jorge",
    re: /HELD-FOR-JORGE|held for Jorge as a merge condition|build-and-HOLD until JORGE/i,
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

/** Allowlist: files that may mention the deleted label while stating it is DELETED / forbidden. */
function isAllowlistedLine(line) {
  return (
    /NO\s+(?:HOLDS|[`'"]?JORGE-APPROVED)|JORGE-APPROVED[`'"]?\s+(?:label\s+)?is\s+DELETED|label is \*\*DELETED\*\*|Does\s+\*\*not\*\*\s+require\s+`?JORGE-APPROVED|do not block on\s+`?JORGE-APPROVED|must not (?:re)?introduce.*JORGE-APPROVED|OWNER LAW.*JORGE-APPROVED|verify-no-approval-holds|are purged|referencing\s+`?JORGE-APPROVED|forbid(?:s|den)?.*JORGE-APPROVED|NOT required.*JORGE|please click JORGE-APPROVED|older text below referencing|"owner applies on Neon"|\/ "owner applies on Neon"|JORGE-APPROVED[`'"]?\s+LABEL/i.test(
      line,
    )
  );
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
      if (isAllowlistedLine(line)) continue;
      for (const f of FORBIDDEN) {
        if (f.re.test(line)) {
          problems.push(`${rel}:${i + 1}: ${f.note} — "${line.trim().slice(0, 120)}"`);
        }
      }
    }
  }
  // Law file must exist and name Execution & speed / DRAIN_PROOF
  const law = path.join(ROOT, ".cursor/rules/00-operating-method-LAW.mdc");
  if (!fs.existsSync(law)) {
    problems.push(".cursor/rules/00-operating-method-LAW.mdc: missing — operating method law required");
  } else {
    const t = fs.readFileSync(law, "utf8");
    if (!/DRAIN_PROOF/i.test(t) || !/Execution & speed/i.test(t)) {
      problems.push(".cursor/rules/00-operating-method-LAW.mdc: must include Execution & speed + DRAIN_PROOF amendment");
    }
    if (!/NO HOLDS|NO [`']?JORGE-APPROVED/i.test(t)) {
      problems.push(".cursor/rules/00-operating-method-LAW.mdc: must state NO HOLDS / NO JORGE-APPROVED");
    }
  }
  return problems;
}

if (SELFTEST) {
  const live = assertNoApprovalHolds();
  // Live may still be dirty before purge lands — selftest only plants a forbidden line into a temp map.
  const planted = new Map();
  const lawRel = ".cursor/rules/00-operating-method-LAW.mdc";
  planted.set(
    path.join(ROOT, lawRel),
    fs.readFileSync(path.join(ROOT, lawRel), "utf8") +
      "\nBad: WAIT for owner OK to merge and apply JORGE-APPROVED.\n",
  );
  // Merge planted over live reads for that one file
  const problems = [];
  const abs = path.join(ROOT, lawRel);
  const text = planted.get(abs);
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isAllowlistedLine(line)) continue;
    for (const f of FORBIDDEN) {
      if (f.re.test(line)) problems.push(`${lawRel}:${i + 1}: ${f.note}`);
    }
  }
  if (!problems.length) {
    console.error(`${LABEL} SELFTEST FAIL — planted hold language not caught`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — planted hold language caught (${problems.length})`);
  // Also report live status without failing selftest (purge PR must make live clean)
  if (live.length) {
    console.log(`${LABEL} note: live governing set still has ${live.length} hit(s) — purge must clear them`);
  }
  process.exit(0);
}

const problems = assertNoApprovalHolds();
if (problems.length) {
  console.error(`${LABEL} FAIL — approval-hold language in governing files:\n`);
  for (const p of problems.slice(0, 80)) console.error(`  - ${p}`);
  if (problems.length > 80) console.error(`  … +${problems.length - 80} more`);
  process.exit(1);
}
console.log(`${LABEL} OK — governing files have no approval-hold / JORGE-APPROVED merge language`);
