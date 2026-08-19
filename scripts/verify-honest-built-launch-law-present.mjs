#!/usr/bin/env node
/**
 * verify-honest-built-launch-law-present.mjs — LAW-2026-08-14-HONEST-BUILT-LAUNCH
 *
 * Ratchet: owner-locked HONEST-BUILT-LAUNCH-LAW must exist, name seat lanes + theater ban,
 * and be cited from every major agent boot path + seat INBOXes so coders cannot "find"
 * a stale Done definition and deviate.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-honest-built-launch-law-present";
const LAW = "docs/lockdown/HONEST-BUILT-LAUNCH-LAW-2026-08-14.md";

const BODY_MARKS = [
  /Launch-ready without Live Chrome/i,
  /leafRe/i,
  /\|\.\*/,
  /word blankets|word-blanket|create\|modal/i,
  /Surface-bar leaf-existence|surface-bar inventory/i,
  /CC-1|Claude Code/i,
  /Cursor/i,
  /Codex/i,
  /Boot order/i,
  /Live=BLOCKED/i,
  /SCOREBOARD-BUILT-SELF-DECLARED|Do not add scoreboard columns/i,
];

const MUST_CITE = [
  "docs/specs/STANDING-SESSION-DIRECTIVE.md",
  "docs/specs/OWNER-QUALITY-COMPACT.md",
  "docs/specs/DEFINITION-OF-DONE.md",
  "docs/specs/PER-PR-CHECKLIST.md",
  "docs/specs/DELIVERY-METHOD-LOCKED.md",
  "docs/specs/CURSOR-OPERATING-CONSTITUTION.md",
  "docs/specs/QUALITY-STANDARD-LOCKED.md",
  "docs/specs/CODER-PASTE-INSTRUCTIONS-2026-08-12.md",
  "AGENTS.md",
  ".cursor/rules/00-always-read-first.mdc",
  ".cursor/rules/38-fully-wired-complete-bar.mdc",
  ".cursor/rules/39-honest-built-launch-law.mdc",
  ".claude/skills/ih35-tms-standards/SKILL.md",
  ".claude/skills/ih35-evidence-before-done/SKILL.md",
  "docs/lockdown/FULLY-WIRED-COMPLETE-BAR-2026-08-13.md",
  "docs/lockdown/VERTICAL-WIRING-LAW-2026-08-12.md",
  "docs/lockdown/00_LOCKED_DECISIONS.md",
  "docs/bus/INBOX-CURSOR.md",
  "docs/bus/INBOX-CC-1.md",
  "docs/bus/INBOX-CODEX.md",
  "docs/bus/INBOX-CC-2.md",
];

const CITE_MARK = /HONEST-BUILT-LAUNCH-LAW-2026-08-14/;

export function findMissing(root = ROOT) {
  const missing = [];
  const lawAbs = path.join(root, LAW);
  if (!fs.existsSync(lawAbs)) {
    missing.push(`${LAW} (missing file)`);
    return missing;
  }
  const body = fs.readFileSync(lawAbs, "utf8");
  for (const re of BODY_MARKS) {
    if (!re.test(body)) missing.push(`${LAW} (missing required mark ${re})`);
  }

  for (const rel of MUST_CITE) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) {
      missing.push(`${rel} (missing file)`);
      continue;
    }
    if (!CITE_MARK.test(fs.readFileSync(abs, "utf8"))) {
      missing.push(`${rel} (does not cite HONEST-BUILT-LAUNCH-LAW-2026-08-14)`);
    }
  }

  const lawJson = path.join(root, "docs/law/LAW.json");
  if (fs.existsSync(lawJson)) {
    if (!fs.readFileSync(lawJson, "utf8").includes("LAW-2026-08-14-HONEST-BUILT-LAUNCH")) {
      missing.push("docs/law/LAW.json (LAW-2026-08-14-HONEST-BUILT-LAUNCH not registered)");
    }
  } else {
    missing.push("docs/law/LAW.json (missing)");
  }

  // Hardened isLeafSpecific must exist in both copies (lockstep with HONEST-BUILT law).
  for (const rel of [
    "scripts/verify-matrix-built-leaf-specific.mjs",
    "apps/backend/src/program/matrix-built-auto.ts",
  ]) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) {
      // The --selftest temp root only creates docs/lockdown/<LAW> — these 2 files live in the real
      // repo tree and are not (and should not need to be) mirrored into the disposable fixture just
      // to exercise the law-completeness assertion this loop is not testing. A bare fs.readFileSync
      // here used to throw ENOENT and crash --selftest outright (not even a clean FAIL) every single
      // run, on real origin/main, independent of any other change — confirmed via `git stash` +
      // re-run on a clean tree before writing this fix.
      missing.push(`${rel} (missing file)`);
      continue;
    }
    const src = fs.readFileSync(abs, "utf8");
    if (!src.includes("HONEST-BUILT-LAUNCH-LAW 2026-08-14")) {
      missing.push(`${rel} (missing HONEST-BUILT-LAUNCH-LAW harden marker on isLeafSpecific)`);
    }
    if (!src.includes("create|modal|drawer|wizard|picker")) {
      missing.push(`${rel} (isLeafSpecific missing word-blanket create|modal|… rejection)`);
    }
  }

  return missing;
}

function main() {
  const missing = findMissing();
  if (missing.length) {
    console.error(`${LABEL} FAIL:`);
    for (const m of missing) console.error(" -", m);
    process.exit(1);
  }
  console.log(`${LABEL} OK — HONEST-BUILT-LAUNCH-LAW present + cited on all boot/INBOX paths`);
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync(path.join(ROOT, "tmp-honest-built-"));
  try {
    fs.mkdirSync(path.join(tmp, "docs/lockdown"), { recursive: true });
    fs.writeFileSync(path.join(tmp, LAW), "incomplete");
    const miss = findMissing(tmp);
    if (!miss.length) {
      console.error(`${LABEL} SELFTEST FAIL — incomplete law should fail`);
      process.exit(1);
    }
    console.log(`${LABEL} --selftest OK`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  process.exit(0);
}

main();
