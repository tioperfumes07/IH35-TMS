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
 *   - docs/module-completion/*.json           (module N-of-M manifests — keyed by items[].id)
 *   - scripts/verify-steps/CLAIMED-NUMBERS.json (collision-strict on claimed.*)
 *   - docs/law/LAW.json                       (bare array of laws — keyed by [].id, see below)
 *   - scripts/.guard-exempt.json              (flat {script: reason} map — plain deep union)
 * Because they are single shared files, any PR that merges first makes EVERY other open
 * PR conflict on them — and hand-resolving them (union guesses) then fails CI because the
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

/** Module-completion manifests: union by item id (never duplicate the same checklist row). */
function isModuleCompletionManifest(p) {
  return /^docs\/module-completion\/[^/]+\.json$/.test(p);
}

const STATUS_RANK = { PASS: 5, HOLD: 4, UNVERIFIED: 3, OPEN: 2, FAIL: 1 };

function preferManifestItem(a, b) {
  const ra = STATUS_RANK[a?.status] ?? 0;
  const rb = STATUS_RANK[b?.status] ?? 0;
  let winner = rb > ra ? b : ra > rb ? a : String(b?.evidence ?? "").length >= String(a?.evidence ?? "").length ? b : a;
  if (a?.evidence && b?.evidence && a.evidence !== b.evidence) {
    const evidence = a.evidence.includes(b.evidence)
      ? a.evidence
      : b.evidence.includes(a.evidence)
        ? b.evidence
        : `${a.evidence} | ${b.evidence}`;
    const status = ra >= rb ? a.status : b.status;
    winner = { ...winner, status, evidence };
  }
  return winner;
}

function unionKeyedArray(oursArr, theirsArr) {
  const byId = new Map();
  for (const it of [...(oursArr || []), ...(theirsArr || [])]) {
    if (!it || typeof it !== "object") continue;
    const id = it.id;
    if (id == null || id === "") {
      // no id — keep as structural unique (fallback)
      const key = JSON.stringify(it);
      if (![...byId.values()].some((x) => JSON.stringify(x) === key)) {
        byId.set(`__anon_${byId.size}`, it);
      }
      continue;
    }
    const prev = byId.get(id);
    byId.set(id, prev ? preferManifestItem(prev, it) : it);
  }
  return [...byId.values()];
}

function unionModuleManifest(ours, theirs) {
  if (!ours) return theirs;
  if (!theirs) return ours;
  const out = { ...ours, ...theirs };
  // Prefer conservative complete: both sides must already be true.
  out.complete = Boolean(ours.complete) && Boolean(theirs.complete);
  if (Array.isArray(ours.items) || Array.isArray(theirs.items)) {
    out.items = unionKeyedArray(ours.items, theirs.items);
  }
  if (Array.isArray(ours.ranked_findings) || Array.isArray(theirs.ranked_findings)) {
    out.ranked_findings = unionKeyedArray(ours.ranked_findings, theirs.ranked_findings);
  }
  // Scalars that are not status/evidence: keep theirs for timestamps/notes when both set.
  for (const k of Object.keys(theirs)) {
    if (k === "items" || k === "ranked_findings" || k === "complete") continue;
    if (!(k in ours)) out[k] = theirs[k];
    else if (typeof ours[k] === "object" && ours[k] && typeof theirs[k] === "object" && theirs[k] && !Array.isArray(ours[k])) {
      out[k] = union(ours[k], theirs[k]);
    } else if (ours[k] !== theirs[k] && theirs[k] !== undefined) {
      // Prefer longer string (more evidence prose) else theirs.
      if (typeof ours[k] === "string" && typeof theirs[k] === "string") {
        out[k] = theirs[k].length >= String(ours[k]).length ? theirs[k] : ours[k];
      } else {
        out[k] = theirs[k];
      }
    }
  }
  return out;
}

/**
 * TOP-LEVEL ID-KEYED ARRAY union — for registries that are a bare array of identified records.
 *
 * docs/law/LAW.json is exactly that: 42 entries of {id,title,source_file,guard,type}. The generic
 * union() above dedupes arrays by STRUCTURAL identity, which is wrong here in one specific and
 * damaging way: if both branches edit the SAME law differently (say one repoints `guard`), the two
 * objects are structurally distinct, so union() keeps BOTH and the registry ends up with two rows of
 * law claiming the same identity. verify-law-registry.mjs already goes RED on a duplicate id
 * (selftest case 5), so that corruption would be caught rather than shipped — but a merge driver
 * whose output reliably reddens CI is not a merge driver. Key by id instead.
 *
 * Disjoint ids (the normal case — each PR registers its own new law) union silently. Same id with
 * DIFFERENT content is a genuine semantic collision, not a rebase nuisance: two lanes disagreeing
 * about what a law says is precisely the thing a human must adjudicate. Refuse and leave a conflict.
 */
function unionIdKeyedRootArray(ours, theirs, pathname) {
  if (!Array.isArray(ours) || !Array.isArray(theirs)) {
    throw new Error(`${pathname} is not a top-level array on both sides`);
  }
  const byId = new Map();
  for (const el of [...ours, ...theirs]) {
    if (!el || typeof el !== "object" || Array.isArray(el) || el.id == null || el.id === "") {
      throw new Error(`${pathname} contains an entry with no id — refusing to key-union`);
    }
    const prev = byId.get(el.id);
    if (prev && JSON.stringify(prev) !== JSON.stringify(el)) {
      throw new ScalarClash(`entry id ${el.id}`, prev, el);
    }
    byId.set(el.id, prev ?? el);
  }
  return [...byId.values()];
}

const ID_KEYED_ROOT_ARRAY = new Set(["docs/law/LAW.json"]);

try {
  const ours = readJson(oursFile);
  const theirs = readJson(theirsFile);
  let merged;
  if (isModuleCompletionManifest(pathname)) {
    merged = unionModuleManifest(ours, theirs);
  } else if (ID_KEYED_ROOT_ARRAY.has(pathname)) {
    merged = ours === undefined ? theirs
      : theirs === undefined ? ours
      : unionIdKeyedRootArray(ours, theirs, pathname);
  } else {
    const strictRoot = COLLISION_STRICT.get(pathname) ?? null;
    merged = ours === undefined ? theirs : theirs === undefined ? ours : union(ours, theirs, strictRoot);
  }
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
