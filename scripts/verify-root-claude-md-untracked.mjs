#!/usr/bin/env node
/**
 * GUARD — verify-root-claude-md-untracked
 *
 * GOV-F01 (docs/audit/GUARD-WORKORDERS.md): root CLAUDE.md was tracked in this PUBLIC repo
 * (commit 01648d102 / PR #4551) and disclosed prod infrastructure identifiers (Neon project
 * id, prod branch, operating_company_id, a sibling checkout path holding a real DATABASE_URL)
 * that the documented secrets-split deliberately keeps git-excluded. It was untracked again in
 * commit f5cdf067a (PR #5528) and root CLAUDE.md is back in .gitignore.
 *
 * This is a SHRINK-ONLY ratchet: root CLAUDE.md must never be tracked again. It does not (and
 * cannot) remove the old disclosure from PUBLIC git history — that needs an owner-approved
 * history rewrite + identifier rotation, which is destructive/outward-facing and out of scope
 * for an autonomous guard. This guard only stops the regression of re-tracking the file.
 *
 * METHOD: `git ls-files` on HEAD (works in CI without a checkout of full history) plus a
 * `.gitignore` pattern check. --selftest proves both a re-tracked file and a missing ignore
 * entry are caught.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";

const LABEL = "verify-root-claude-md-untracked";

function isTracked(cwd) {
  try {
    const out = execFileSync("git", ["ls-files", "--error-unmatch", "CLAUDE.md"], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return out.toString().trim().length > 0;
  } catch {
    return false; // ls-files --error-unmatch exits non-zero when the path is not tracked
  }
}

function gitignoreExcludesRoot(cwd) {
  const text = readFileSync(`${cwd}/.gitignore`, "utf8");
  return text.split("\n").some((line) => line.trim() === "CLAUDE.md");
}

function run(cwd = process.cwd()) {
  const tracked = isTracked(cwd);
  if (tracked) {
    return {
      ok: false,
      message:
        `${LABEL} FAILED — root CLAUDE.md is tracked in git again (GOV-F01 regression). ` +
        `This repo is PUBLIC; the prior disclosure (commit 01648d102 / PR #4551) is the exact ` +
        `failure this guard exists to stop. git rm --cached CLAUDE.md and keep it in .gitignore.`,
    };
  }
  if (!gitignoreExcludesRoot(cwd)) {
    return {
      ok: false,
      message: `${LABEL} FAILED — root CLAUDE.md is untracked but no longer listed in .gitignore; add it back.`,
    };
  }
  return {
    ok: true,
    message: `${LABEL} OK — root CLAUDE.md is untracked and excluded via .gitignore (GOV-F01 working-tree fix holds). Public git history from PR #4551 still contains the old disclosure; that removal needs an owner-approved history rewrite + identifier rotation and is out of scope for this guard.`,
  };
}

function selftest() {
  const tmp = `/tmp/verify-root-claude-md-untracked-selftest-${Date.now()}`;
  execFileSync("git", ["init", "-q", tmp]);
  writeFileSync(`${tmp}/.gitignore`, "CLAUDE.md\n");
  execFileSync("git", ["-C", tmp, "add", ".gitignore"]);
  execFileSync("git", ["-C", tmp, "-c", "user.email=t@t.com", "-c", "user.name=t", "commit", "-q", "-m", "init"]);

  // Baseline: untracked + ignored -> OK
  const baseline = run(tmp);
  if (!baseline.ok) {
    console.error(`${LABEL} --selftest FAIL — baseline (untracked + ignored) should pass: ${baseline.message}`);
    process.exit(1);
  }

  // Offender 1: CLAUDE.md re-tracked
  writeFileSync(`${tmp}/CLAUDE.md`, "# leaked\n");
  execFileSync("git", ["-C", tmp, "add", "-f", "CLAUDE.md"]);
  const offender1 = run(tmp);
  if (offender1.ok) {
    console.error(`${LABEL} --selftest FAIL — re-tracked CLAUDE.md was not caught`);
    process.exit(1);
  }
  execFileSync("git", ["-C", tmp, "rm", "-f", "--cached", "CLAUDE.md"]);
  unlinkSync(`${tmp}/CLAUDE.md`);

  // Offender 2: .gitignore entry removed
  writeFileSync(`${tmp}/.gitignore`, "\n");
  const offender2 = run(tmp);
  if (offender2.ok) {
    console.error(`${LABEL} --selftest FAIL — missing .gitignore entry was not caught`);
    process.exit(1);
  }

  console.log(`${LABEL} --selftest PASS — 2/2 offenders caught, baseline clean`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const result = run();
  console.log(result.message);
  if (!result.ok) process.exit(1);
}
