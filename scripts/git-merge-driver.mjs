#!/usr/bin/env node
/**
 * git-merge-driver.mjs — custom git merge driver for DERIVED / APPEND-ONLY registry JSON files.
 *
 * WHY THIS EXISTS
 * ---------------
 * A handful of generated/registry JSON files are touched by EVERY migration PR:
 *   - docs/schema-parity-baseline.json        (pure derived cache of migration DDL)
 *   - db/migrations/.held-migrations.json     (append-only held-migration registry)
 *   - scripts/entity-isolation-allowlist.json (derived allowlist + append-only backlog)
 * Because they are single shared files, any migration PR that merges first makes EVERY other open
 * migration PR conflict on them — and hand-resolving them (union guesses) then fails CI because the
 * baseline must EXACTLY match `verify-schema-parity.mjs --update`. That treadmill cost real money.
 *
 * These files have NO runtime consumer (CI-only). For two branches that each ADD columns / register a
 * held migration, the correct merge is simply the UNION of both sides (arrays union by value, objects
 * recurse). This driver performs that deep union automatically so `git merge origin/main` NEVER
 * surfaces a conflict on them. The post-merge hook then runs `verify-schema-parity.mjs --update`
 * (pure static, no DB) to canonicalize the baseline exactly.
 *
 * GIT CONTRACT
 * ------------
 * Registered (see scripts/setup-git-merge-drivers.mjs) as:
 *   merge.json-union.driver = node scripts/git-merge-driver.mjs %O %A %B %P
 * git passes: %O ancestor, %A OURS (we MUST write the result here), %B THEIRS, %P real pathname.
 * Exit 0 = merged cleanly; non-zero = leave a conflict (safe fallback if we can't parse).
 */
import fs from "node:fs";

const [, , ancestorFile, oursFile, theirsFile, pathname = "(unknown)"] = process.argv;

function readJson(file) {
  const raw = fs.readFileSync(file, "utf8");
  if (raw.trim() === "") return undefined;
  return JSON.parse(raw);
}

/** Deep union: arrays union by structural identity; objects recurse; scalars prefer THEIRS on mismatch. */
/**
 * COLLISION-STRICT paths. For these files a scalar clash is NOT a merge nuisance to be smoothed over —
 * it is the exact signal the file exists to raise.
 *
 * scripts/verify-steps/CLAIMED-NUMBERS.json says so in its own _note: "Two agents claiming the same
 * number then CONFLICT IN GIT instead of silently agreeing and reddening main afterwards", and its
 * _why: "A registry converts an invisible race into a merge conflict, which is where it belongs."
 * Plain last-writer-wins union would silently drop one claimant and hand the clash to CI on some later
 * branch cut from a red main — fail-late instead of fail-fast, which is precisely what the registry
 * was built to prevent.
 *
 * So on these paths: distinct keys union freely (the common, harmless case — two agents claiming two
 * DIFFERENT numbers, which caused every conflict in the 2026-07-27 queue), while the same key holding
 * two DIFFERENT values raises a real conflict. Identical values on both sides are not a clash and
 * collapse to one.
 */
const COLLISION_STRICT = new Map([
  // path -> the ONLY subtree where a scalar clash is a genuine collision. Everything else in these
  // files (derived counters like total_claimed, generated_at timestamps, prose _note/_why) is
  // SUPPOSED to differ between branches and must keep merging normally. Making the whole file strict
  // turned `total_claimed: 765` vs `770` into a hard conflict on every rebase — a false positive
  // worse than the treadmill it replaced.
  ["scripts/verify-steps/CLAIMED-NUMBERS.json", "claimed"],
]);

/** True only INSIDE the strict subtree — "claimed.1662" yes, "total_claimed" no. */
function isStrictPath(strictRoot, keyPath) {
  if (!strictRoot) return false;
  return keyPath === strictRoot || keyPath.startsWith(`${strictRoot}.`);
}

class ScalarClash extends Error {
  constructor(keyPath, ours, theirs) {
    super(`same key claimed by both sides with different values at "${keyPath}": ours=${JSON.stringify(ours)} theirs=${JSON.stringify(theirs)}`);
    this.name = "ScalarClash";
  }
}

function union(ours, theirs, strictRoot = null, keyPath = "") {
  if (Array.isArray(ours) && Array.isArray(theirs)) {
    const seen = new Set();
    const out = [];
    for (const el of [...ours, ...theirs]) {
      const key = JSON.stringify(el);
      if (!seen.has(key)) {
        seen.add(key);
        out.push(el);
      }
    }
    return out;
  }
  if (ours && theirs && typeof ours === "object" && typeof theirs === "object") {
    const out = { ...ours };
    for (const k of Object.keys(theirs)) {
      out[k] = k in ours ? union(ours[k], theirs[k], strictRoot, keyPath ? `${keyPath}.${k}` : k) : theirs[k];
    }
    return out;
  }
  // Scalar (or type mismatch).
  if (isStrictPath(strictRoot, keyPath) && ours !== undefined && theirs !== undefined && ours !== theirs) {
    // Two sides claimed the SAME key with DIFFERENT values. On a collision-strict path this is the
    // real race the file exists to surface — refuse to pick a winner.
    throw new ScalarClash(keyPath, ours, theirs);
  }
  return theirs === undefined ? ours : theirs;
}

try {
  const ours = readJson(oursFile);
  const theirs = readJson(theirsFile);
  const strictRoot = COLLISION_STRICT.get(pathname) ?? null;
  const merged = ours === undefined ? theirs : theirs === undefined ? ours : union(ours, theirs, strictRoot);
  // Preserve trailing newline convention used by the --update generators.
  fs.writeFileSync(oursFile, JSON.stringify(merged, null, 2) + "\n");
  process.exit(0);
} catch (err) {
  // Could not parse one side — do NOT silently corrupt; leave a real conflict for a human.
  if (err.name === "ScalarClash") {
    process.stderr.write(
      `git-merge-driver: REFUSING to auto-merge ${pathname} — ${err.message}.\n` +
        `  This is a genuine collision, not a rebase nuisance: both branches claimed the same key.\n` +
        `  Resolve by hand — take the next free number and keep BOTH claims.\n`
    );
  } else {
    process.stderr.write(
      `git-merge-driver: could not auto-union ${pathname} (${err.message}); leaving conflict for manual resolution.\n`
    );
  }
  process.exit(1);
}
