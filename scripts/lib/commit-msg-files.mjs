/**
 * Shared commit-msg path resolution (Rule 25).
 * Kept free of CLI side-effects so importers can --selftest safely.
 */
import fs from "node:fs";
import { execSync } from "node:child_process";

/**
 * ENG-18 (row 256) — the commit KIND is recorded by .husky/prepare-commit-msg (scripts/prepare-commit-kind.mjs), the
 * only hook git tells whether this is an amend: an amend gets `$2=commit $3=HEAD`. Guessing "amend" from "nothing
 * staged" was wrong both ways:
 *   - an amend that ALSO stages files classified only the staged ones, so a money file already in the commit being
 *     rewritten escaped the money / DoD rules;
 *   - a NEW commit with nothing staged (--allow-empty) was classified by the PREVIOUS commit's files.
 * kind "amend" -> HEAD's files UNION staged (what the rewritten commit will contain); kind "new" -> staged only.
 * No marker (hook missing, old clone) -> the previous behaviour: staged, else HEAD tree (head-amend).
 */
export function readCommitKind({ gitPath = () => execSync("git rev-parse --git-path IH35_COMMIT_KIND", { encoding: "utf8" }).trim(), read = (p) => fs.readFileSync(p, "utf8"), remove = (p) => fs.rmSync(p, { force: true }) } = {}) {
  try {
    const p = gitPath();
    const kind = read(p).trim();
    remove(p);
    return kind === "amend" || kind === "new" ? kind : null;
  } catch {
    return null;
  }
}

/**
 * Prefer staged paths (normal commit). Fall back to HEAD tree when staged is empty
 * (amend / message-only rewrite) so money/DoD cannot be skipped.
 */
export function resolveCommitMsgFiles({
  stagedDiff = () =>
    execSync("git diff --cached --name-only", { encoding: "utf8" }),
  headTree = () =>
    execSync("git diff-tree --no-commit-id --name-only -r HEAD", { encoding: "utf8" }),
  kind = undefined,
} = {}) {
  const parse = (raw) =>
    `${raw ?? ""}`
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  const safe = (fn) => {
    try {
      return parse(fn());
    } catch {
      return [];
    }
  };
  const k = kind === undefined ? readCommitKind() : kind;
  if (k === "amend") {
    const files = [...new Set([...safe(headTree), ...safe(stagedDiff)])];
    return { files, source: files.length ? "amend" : "empty" };
  }
  if (k === "new") {
    const files = safe(stagedDiff);
    return { files, source: files.length ? "staged" : "empty" };
  }
  const staged = safe(stagedDiff);
  if (staged.length > 0) return { files: staged, source: "staged" };
  const head = safe(headTree);
  if (head.length > 0) return { files: head, source: "head-amend" };
  return { files: [], source: "empty" };
}
