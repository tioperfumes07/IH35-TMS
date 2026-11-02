/**
 * Shared commit-msg path resolution (Rule 25).
 * Kept free of CLI side-effects so importers can --selftest safely.
 */
import fs from "node:fs";
import { execSync, execFileSync } from "node:child_process";

/**
 * ENG-18 (row 256) — the commit KIND is recorded by .husky/prepare-commit-msg (scripts/prepare-commit-kind.mjs), the
 * hook args do NOT reveal intent for --amend -m / new -C HEAD. The explicit commit wrapper sets
 * IH35_COMMIT_INTENT only for its child Git process. Without that, inspect both possible commits.
 * Guessing "amend" from "nothing staged" was wrong both ways:
 *   - an amend that ALSO stages files classified only the staged ones, so a money file already in the commit being
 *     rewritten escaped the money / DoD rules;
 *   - a NEW commit with nothing staged (--allow-empty) was classified by the PREVIOUS commit's files.
 * kind "amend" -> index versus HEAD's first parent (empty tree for root); kind "new" -> staged only.
 * Unknown -> union of both candidate diffs, never staged-only. This may demand extra evidence on raw
 * git commit; scripts/commit-with-evidence.mjs gives exact intent without disabling hooks.
 */
export function readCommitKind({ gitPath = () => execSync("git rev-parse --git-path IH35_COMMIT_KIND", { encoding: "utf8" }).trim(), read = (p) => fs.readFileSync(p, "utf8"), remove = (p) => fs.rmSync(p, { force: true }), intent = process.env.IH35_COMMIT_INTENT } = {}) {
  try {
    const p = gitPath();
    const kind = read(p).trim();
    remove(p);
    return (kind === "amend" || kind === "new") && kind === intent ? kind : null;
  } catch {
    return null;
  }
}

/**
 * HEAD's first parent is the base for the rewritten commit, including root and merge commits.
 * Read the actual index (including Git's temporary index for partial commits), not a HEAD/staged union.
 */
export function amendedIndexFiles() {
  const git = (args, input) => execFileSync("git", args, { encoding: "utf8", input });
  const head = git(["rev-parse", "--verify", "--quiet", "HEAD"]).trim();
  const parent = git(["rev-list", "--parents", "-n", "1", head]).trim().split(/\s+/)[1];
  const base = parent || git(["hash-object", "-t", "tree", "--stdin"], "").trim();
  return git(["diff", "--cached", "--name-only", base]);
}

export function resolveCommitMsgFiles({
  stagedDiff = () =>
    execSync("git diff --cached --name-only", { encoding: "utf8" }),
  headTree = () => {
    // No HEAD is a genuine initial commit, not an empty result from a failed diff.
    try { execFileSync("git", ["rev-parse", "--verify", "--quiet", "HEAD"], { stdio: "pipe" }); }
    catch (err) { if (err.status === 1) return stagedDiff(); throw err; }
    return amendedIndexFiles();
  },
  kind = undefined,
} = {}) {
  const parse = (raw) =>
    `${raw ?? ""}`
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  const safe = (fn) => {
    return parse(fn()); // A failed Git read must not turn into an empty, unguarded commit.
  };
  const k = kind === undefined ? readCommitKind() : kind;
  if (k === "amend") {
    const files = safe(headTree);
    return { files, source: files.length ? "amend" : "empty" };
  }
  if (k === "new") {
    const files = safe(stagedDiff);
    return { files, source: files.length ? "staged" : "empty" };
  }
  const files = [...new Set([...safe(headTree), ...safe(stagedDiff)])];
  return { files, source: files.length ? "unknown-both" : "empty" };
}
