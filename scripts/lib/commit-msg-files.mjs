/**
 * Shared commit-msg path resolution (Rule 25).
 * Kept free of CLI side-effects so importers can --selftest safely.
 */
import { execSync } from "node:child_process";

/**
 * Prefer staged paths (normal commit). Fall back to HEAD tree when staged is empty
 * (amend / message-only rewrite) so money/DoD cannot be skipped.
 */
export function resolveCommitMsgFiles({
  stagedDiff = () =>
    execSync("git diff --cached --name-only", { encoding: "utf8" }),
  headTree = () =>
    execSync("git diff-tree --no-commit-id --name-only -r HEAD", { encoding: "utf8" }),
} = {}) {
  const parse = (raw) =>
    `${raw ?? ""}`
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  try {
    const staged = parse(stagedDiff());
    if (staged.length > 0) return { files: staged, source: "staged" };
  } catch {
    /* fall through */
  }
  try {
    const head = parse(headTree());
    if (head.length > 0) return { files: head, source: "head-amend" };
  } catch {
    /* fall through */
  }
  return { files: [], source: "empty" };
}
