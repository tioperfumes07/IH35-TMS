/**
 * Shared commit-msg path resolution (Rule 25).
 * Kept free of CLI side-effects so importers can --selftest safely.
 */
import { execSync } from "node:child_process";

/**
 * The files the RESULTING COMMIT will contain.
 *
 * Normal commit: the staged paths.
 *
 * AMEND: the UNION of the staged paths and the paths already in HEAD, because an amend REWRITES
 * HEAD — the resulting commit contains both. The previous version returned the staged list alone
 * whenever it was non-empty, and fell back to HEAD only when staged was EMPTY. That covered the
 * message-only amend the comment described and MISSED its mirror image: an amend that stages new
 * files was classified on the delta alone, as if HEAD's files were not in the commit.
 *
 * MEASURED 2026-10-05: amending a correction (2 backend .test.ts + 9 frontend files) into a commit
 * that already carried apps/backend/src/accounting/account-register.service.ts was classified from
 * the 11 staged paths only. Both backend paths in that delta are .test.ts, which
 * verify-no-money-theater excludes from hasBackendDataPath, so the commit was rejected as money
 * theater for "no backend data path" while the commit it was rewriting contained exactly that path.
 *
 * Union is also the CONSERVATIVE direction: more paths classified means more commits correctly
 * recognised as money-path commits and therefore MORE evidence required, never less. It cannot let
 * anything through that the previous behavior caught.
 *
 * `source` reports which inputs contributed, so a reader can tell a plain commit from an amend.
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

  let staged = [];
  try {
    staged = parse(stagedDiff());
  } catch {
    /* fall through */
  }

  let head = [];
  try {
    head = parse(headTree());
  } catch {
    /* fall through */
  }

  // A commit-msg hook cannot see the porcelain's own flags, so "is this an amend" is not reliably
  // knowable here. Rather than guess, the union is taken WHENEVER both lists are non-empty: for a
  // plain commit that adds HEAD's paths as well, the only effect is classifying a few extra paths,
  // which can only make the DoD requirements stricter. Guessing wrong in the other direction is
  // what let a real money-path commit be called theater.
  if (staged.length > 0 && head.length > 0) {
    const union = [...new Set([...staged, ...head])];
    return { files: union, source: "staged+head-union" };
  }
  if (staged.length > 0) return { files: staged, source: "staged" };
  if (head.length > 0) return { files: head, source: "head-amend" };
  return { files: [], source: "empty" };
}

