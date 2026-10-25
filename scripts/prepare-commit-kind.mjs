#!/usr/bin/env node
/**
 * ENG-18 (row 256) — prepare-commit-msg: record whether this commit is an AMEND or a NEW commit, so commit-msg
 * (scripts/check-commit-evidence.mjs via lib/commit-msg-files.mjs) classifies the files the commit will really contain.
 * git calls this hook as: <msg-file> [source] [sha]. An amend is source "commit" + sha "HEAD" (or HEAD's sha);
 * `-c/-C <other>` is source "commit" with a different sha and is a NEW commit. Never blocks a commit.
 */
import fs from "node:fs";
import { execSync } from "node:child_process";

export function commitKind(source, sha, headSha) {
  if (source !== "commit" || !sha) return "new";
  if (sha === "HEAD") return "amend";
  return headSha && (sha === headSha || headSha.startsWith(sha)) ? "amend" : "new";
}

if (process.argv.includes("--selftest")) {
  const cases = [
    [commitKind(undefined, undefined, "abc"), "new", "plain commit"],
    [commitKind("message", undefined, "abc"), "new", "-m commit"],
    [commitKind("commit", "HEAD", "abc"), "amend", "--amend"],
    [commitKind("commit", "abc123", "abc123ff"), "amend", "--amend (sha form)"],
    [commitKind("commit", "def456", "abc123"), "new", "-C other commit"],
    [commitKind("merge", undefined, "abc"), "new", "merge"],
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
  fs.writeFileSync(p, commitKind(source, sha, head) + "\n");
} catch {
  /* never block a commit from here — commit-msg falls back to its previous behaviour */
}
