#!/usr/bin/env node
/**
 * ENG-18 (row 256) — prepare-commit-msg: record whether this commit is an AMEND or a NEW commit, so commit-msg
 * (scripts/check-commit-evidence.mjs via lib/commit-msg-files.mjs) classifies the files the commit will really contain.
 * Git hook arguments are ambiguous: --amend -m has source "message", while a NEW -C HEAD has
 * source "commit" / "HEAD". Only the explicit wrapper's child environment conveys intent.
 * Unwrapped invocations remain unknown; commit-msg checks both candidate file sets.
 */
import fs from "node:fs";
import { execSync } from "node:child_process";

export function commitKind(source, sha, headSha, intent) {
  return intent === "new" || intent === "amend" ? intent : "unknown";
}

if (process.argv.includes("--selftest")) {
  const cases = [
    [commitKind(undefined, undefined, "abc"), "unknown", "plain unwrapped commit"],
    [commitKind("message", undefined, "abc"), "unknown", "-m can be new or amend"],
    [commitKind("commit", "HEAD", "abc"), "unknown", "-C HEAD can be new or amend"],
    [commitKind("commit", "def456", "abc123"), "unknown", "-C other can also amend"],
    [commitKind("message", undefined, "abc", "amend"), "amend", "explicit amend with message"],
    [commitKind("commit", "HEAD", "abc", "new"), "new", "explicit new reusing message"],
  ];
  const bad = cases.filter(([got, want]) => got !== want);
  for (const [got, want, n] of cases) console.log(`  ${got === want ? "PASS" : "FAIL"}  ${n} -> ${got}`);
  console.log(`prepare-commit-kind --selftest ${bad.length ? "FAIL" : "PASS"} ${cases.length - bad.length}/${cases.length}`);
  process.exit(bad.length ? 1 : 0);
}

try {
  const [, , , source, sha] = process.argv;
  let head = "";
  try { head = execSync("git rev-parse HEAD", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch {}
  const p = execSync("git rev-parse --git-path IH35_COMMIT_KIND", { encoding: "utf8" }).trim();
  fs.writeFileSync(p, commitKind(source, sha, head, process.env.IH35_COMMIT_INTENT) + "\n");
} catch {
  /* commit-msg treats missing/stale markers as unknown and checks both candidate sets */
}
