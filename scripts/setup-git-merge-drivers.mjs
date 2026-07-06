#!/usr/bin/env node
/**
 * setup-git-merge-drivers.mjs — registers the custom `json-union` merge driver in THIS clone's git
 * config. Run automatically from package.json "prepare" (husky) on every `npm install`, so every
 * clone/worktree gets the driver without manual setup. Merge-driver config lives in the common git
 * dir, so it also covers linked worktrees.
 *
 * The .gitattributes file (committed) maps the derived/registry JSON files to merge=json-union; this
 * script defines what json-union actually does. Both are required — attributes without the driver
 * definition falls back to a normal (conflicting) merge.
 *
 * Idempotent: re-running just re-sets the same values. No-op outside a git work tree (e.g. CI tarball).
 */
import { execSync } from "node:child_process";

function git(args) {
  return execSync(`git ${args}`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
}

try {
  // bail quietly if not inside a git work tree
  git("rev-parse --is-inside-work-tree");
} catch {
  process.exit(0);
}

try {
  git(`config merge.json-union.name "deep JSON union of derived/registry files (see scripts/git-merge-driver.mjs)"`);
  git(`config merge.json-union.driver "node scripts/git-merge-driver.mjs %O %A %B %P"`);
  // (recursive unset → git reuses this same driver for internal ancestor merges)
  process.stdout.write("git-merge-driver: registered merge.json-union for derived/registry JSON files.\n");
} catch (err) {
  // never fail an install over this
  process.stderr.write(`git-merge-driver: could not register (${err.message}); merges on registry files may conflict until 'npm run setup:git-drivers'.\n`);
  process.exit(0);
}
