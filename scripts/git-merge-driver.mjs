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
function union(ours, theirs) {
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
      out[k] = k in ours ? union(ours[k], theirs[k]) : theirs[k];
    }
    return out;
  }
  // scalar (or type mismatch): prefer theirs (incoming main) — rare for these append-only caches
  return theirs === undefined ? ours : theirs;
}

try {
  const ours = readJson(oursFile);
  const theirs = readJson(theirsFile);
  const merged = ours === undefined ? theirs : theirs === undefined ? ours : union(ours, theirs);
  // Preserve trailing newline convention used by the --update generators.
  fs.writeFileSync(oursFile, JSON.stringify(merged, null, 2) + "\n");
  process.exit(0);
} catch (err) {
  // Could not parse one side — do NOT silently corrupt; leave a real conflict for a human.
  process.stderr.write(
    `git-merge-driver: could not auto-union ${pathname} (${err.message}); leaving conflict for manual resolution.\n`
  );
  process.exit(1);
}
