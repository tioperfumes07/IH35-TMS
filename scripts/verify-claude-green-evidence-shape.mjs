#!/usr/bin/env node
/**
 * GUARD: tip commit LIVE PROOF matches Claude-green shape (Rule 30).
 *
 * Rejects the Cursor theater class:
 *   LIVE PROOF: UNVERIFIED browser
 *   LIVE PROOF: UNVERIFIED — guard selftest OK   (OK is not a command/sha artifact when labelled LIVE PROOF)
 *
 * Accepts Claude shape:
 *   LIVE PROOF: node scripts/verify-x.mjs --selftest exit 0; …
 *   LIVE PROOF: UNVERIFIED: browser click-through pending deploy SHA
 *   UNVERIFIED: named blocker (standalone label)
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-claude-green-evidence-shape";
const SELFTEST = process.argv.includes("--selftest");

function tipMessage() {
  return execSync("git log -1 --format=%B", { cwd: ROOT, encoding: "utf8" });
}

/** Exported for selftest + cursor-pr-body-gate. */
export function assertClaudeGreenEvidenceShape(text) {
  const problems = [];
  if (!text || !/\S/.test(text)) {
    problems.push("empty evidence text");
    return problems;
  }

  const hasRoot = /^[\s>*_#\-]*ROOT CAUSE\b/im.test(text);
  const hasFix = /^[\s>*_#\-]*FIX\b/im.test(text);
  const hasGuard = /^[\s>*_#\-]*GUARD\b/im.test(text);
  const hasRemaining = /^[\s>*_#\-]*REMAINING\b/im.test(text);
  if (!hasRoot || !hasFix || !hasGuard || !hasRemaining) {
    problems.push(
      "missing labelled ROOT CAUSE / FIX / GUARD / REMAINING (Claude-green block — Rule 30).",
    );
  }

  const liveLine = text.split(/\r?\n/).find((l) => /^[\s>*_#\-]*(LIVE PROOF|UNVERIFIED)\b/i.test(l));
  if (!liveLine) {
    problems.push("missing LIVE PROOF: or UNVERIFIED: labelled line.");
    return problems;
  }

  const isBareUnverifiedTheater =
    /^[\s>*_#\-]*LIVE PROOF\b[^:\n]*:\s*UNVERIFIED\b(?!\s*[:—–-])/i.test(liveLine) ||
    /^[\s>*_#\-]*LIVE PROOF\b[^:\n]*:\s*UNVERIFIED\s+browser\b/i.test(liveLine);

  if (isBareUnverifiedTheater) {
    problems.push(
      `weak LIVE PROOF theater: "${liveLine.trim()}". Use ` +
        `LIVE PROOF: node scripts/verify-….mjs --selftest exit 0; … ` +
        `and put gaps in REMAINING — or LIVE PROOF: UNVERIFIED: <named blocker> (colon/emdash required).`,
    );
  }

  const hasArtifact =
    /\bexit\s*0\b/i.test(liveLine) ||
    /[0-9a-f]{7,40}\b/i.test(liveLine) ||
    /https?:\/\//i.test(liveLine) ||
    /\/api\//i.test(liveLine) ||
    /\b\d{2,}\b/.test(liveLine) ||
    /^[\s>*_#\-]*LIVE PROOF\b[^:\n]*:\s*UNVERIFIED\s*[:—–-]\s*\S+/i.test(liveLine) ||
    /^[\s>*_#\-]*UNVERIFIED\s*[:—–-]\s*\S+/i.test(liveLine);

  if (!hasArtifact) {
    problems.push(
      `LIVE PROOF/UNVERIFIED line names no artifact: "${liveLine.trim()}". ` +
        `Claude-green requires exit 0 / sha / endpoint / count, or UNVERIFIED: <blocker>.`,
    );
  }

  if (/^##\s+Summary\b/m.test(text) && !/^FINDING\s*:/m.test(text)) {
    problems.push(
      "## Summary preamble without FINDING: — replace with FINDING-first Claude body (Rule 30).",
    );
  }

  return problems;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain && SELFTEST) {
  const failures = [];
  const expect = (name, text, needle) => {
    const p = assertClaudeGreenEvidenceShape(text);
    if (!p.some((x) => x.includes(needle))) {
      failures.push(`${name}: NOT caught (got: ${p.join(" | ") || "none"})`);
    }
  };
  const refute = (name, text) => {
    const p = assertClaudeGreenEvidenceShape(text);
    if (p.length) failures.push(`${name}: false positive — ${p.join(" | ")}`);
  };

  const good = `FINDING: X
LANE: NON-FINANCIAL
ROOT CAUSE: mechanism
FIX: change
GUARD: scripts/verify-x.mjs
LIVE PROOF: node scripts/verify-x.mjs --selftest exit 0; verify-definition-of-done-evidence OK.
REMAINING: none`;

  refute("claude-shape", good);
  expect(
    "weak-unverified-browser",
    good.replace(
      /LIVE PROOF:.*/,
      "LIVE PROOF: UNVERIFIED browser — guard selftest OK",
    ),
    "weak LIVE PROOF theater",
  );
  expect(
    "summary-no-finding",
    "## Summary\nROOT CAUSE: x\nFIX: y\nGUARD: z\nLIVE PROOF: exit 0\nREMAINING: none",
    "## Summary",
  );
  refute(
    "unverified-colon",
    good.replace(
      /LIVE PROOF:.*/,
      "LIVE PROOF: UNVERIFIED: browser click-through pending deploy SHA",
    ),
  );

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

if (isMain) {
  const problems = assertClaudeGreenEvidenceShape(tipMessage());
  if (problems.length) {
    console.error(`${LABEL} FAILED — tip commit is not Claude-green (Rule 30):`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — tip commit LIVE PROOF / evidence shape matches Claude-green`);
  process.exit(0);
}
