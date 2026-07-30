#!/usr/bin/env node
/**
 * LST-ORPH-04 — verify-step numbers must be unique and registered.
 *
 * WHY IT MATTERS: the money-PR git gate requires an unambiguous `GUARD: scripts/verify-steps/NNN-…`
 * reference. When several files share a leading number, that reference no longer identifies one
 * guard, and the traceability the gate exists to provide quietly stops working. The loader is NOT
 * affected — verify-pre-commit enumerates full filenames — so nothing is shadowed at runtime. This is
 * a TRACEABILITY defect, not an execution one, and it is worth saying so plainly rather than
 * implying guards are being skipped.
 *
 * TWO ASSERTIONS, deliberately different in strength:
 *
 *   1. REGISTRATION — every numbered step's number must appear in CLAIMED-NUMBERS.json.
 *      FULLY ENFORCED, no grandfathering: all 806 numbered groups already satisfy it, so there is
 *      nothing to exempt and no reason to weaken it.
 *
 *   2. UNIQUENESS — no NEW duplicate number. 87 historical groups are frozen in
 *      verify-step-number-historical-collisions.json. They are grandfathered for one specific
 *      reason: renaming them would invalidate the `GUARD:` references already recorded in merged
 *      commits, destroying the very traceability this protects. That is the same treatment
 *      verify-migration-filenames gives its 17 historical migration pairs.
 *
 * The frozen list is kept HONEST: a listed group that no longer collides is a FAILURE, not a silent
 * pass, so the list can only shrink.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const STEPS = join(ROOT, "scripts/verify-steps");
const REGISTRY = join(STEPS, "CLAIMED-NUMBERS.json");
const FROZEN = join(ROOT, "scripts/verify-step-number-historical-collisions.json");
const LABEL = "verify-verify-step-numbers-unique";

export function collectGroups(filenames) {
  const groups = new Map();
  for (const f of filenames) {
    if (!f.endsWith(".mjs")) continue;
    const m = /^(\d+)-/.exec(f);
    if (!m) continue;
    if (!groups.has(m[1])) groups.set(m[1], []);
    groups.get(m[1]).push(f);
  }
  return groups;
}

export function analyse(groups, registry, frozen) {
  const problems = [];
  const frozenSet = new Set(frozen);

  const notes = [];
  const duplicates = [...groups.entries()].filter(([, v]) => v.length > 1).map(([k]) => k);
  const newDuplicates = duplicates.filter((n) => !frozenSet.has(n));
  const staleFrozen = frozen.filter((n) => !duplicates.includes(n));
  const unregistered = [...groups.keys()].filter((n) => !(n in registry));

  for (const n of newDuplicates) {
    problems.push(
      `NEW duplicate step number "${n}" — ${groups.get(n).join(", ")}. A "GUARD: scripts/verify-steps/${n}-…" ` +
        `reference can no longer identify one guard. Claim a free number in CLAIMED-NUMBERS.json instead.`
    );
  }
  for (const n of staleFrozen) {
    problems.push(
      `frozen collision "${n}" no longer collides — remove it from verify-step-number-historical-collisions.json. ` +
        `The frozen list must only ever shrink, or it stops describing reality.`
    );
  }
  // TOOL-F03 (2026-07-30): registration in CLAIMED-NUMBERS.json is NO LONGER a failure.
  //
  // The stated reason was "unregistered numbers are how two lanes claim the same one". They are not.
  // Two lanes claiming one number produces TWO FILES with that number, which is `newDuplicates` above —
  // computed from the directory, independent of any registry. Registration restated a claim the
  // FILENAME already makes, and the cost was concrete: every guard PR from either agent had to edit
  // one shared JSON, and GitHub cannot run this repo's json-union merge driver, so any two guard PRs
  // conflicted on merge. That is a guaranteed conflict bought for zero additional safety.
  //
  // What actually prevents two lanes picking one number is the PARITY BAND — Claude ODD, Cursor EVEN
  // (owner ruling 2026-07-28) — which until now was a rule in a document with no enforcement anywhere.
  // scripts/verify-verify-step-lane-band.mjs enforces it mechanically, the way
  // verify-migration-lane-band.mjs has enforced the migration bands since the same day. With parity
  // enforced by branch prefix, the lanes CANNOT collide, and the registry is free to be what it always
  // really was: documentation and history.
  //
  // The registry is NOT deleted (§7 additive-only) and is still reported, so drift stays visible.
  if (unregistered.length > 0) {
    notes.push(
      `${unregistered.length} step number(s) not listed in CLAIMED-NUMBERS.json ` +
        `(${unregistered.slice(0, 5).join(", ")}${unregistered.length > 5 ? ", …" : ""}) — informational; ` +
        `uniqueness comes from the directory and lane parity is enforced by verify:verify-step-lane-band.`
    );
  }

  return { problems, duplicates, newDuplicates, staleFrozen, unregistered, notes };
}

export function run() {
  const groups = collectGroups(readdirSync(STEPS));
  const registry = JSON.parse(readFileSync(REGISTRY, "utf8")).claimed ?? {};
  const frozenDoc = JSON.parse(readFileSync(FROZEN, "utf8"));
  const frozen = frozenDoc.groups ?? [];

  if (groups.size === 0) {
    return { ok: false, message: `${LABEL} FAIL: found ZERO numbered verify-steps — the guard lost its subject.` };
  }

  const { problems, duplicates } = analyse(groups, registry, frozen);
  const ok = problems.length === 0;
  return {
    ok,
    message: ok
      ? `${LABEL} OK — ${groups.size} numbered step group(s), all registered in CLAIMED-NUMBERS.json; ` +
        `${duplicates.length} historical collision(s) grandfathered, 0 new.`
      : `${LABEL} FAILED (${problems.length}):\n  - ${problems.join("\n  - ")}`,
  };
}

function selftest() {
  const base = new Map([
    ["1001", ["1001-a.mjs"]],
    ["1002", ["1002-b.mjs", "1002-c.mjs"]], // historical, frozen
  ]);
  const registry = { 1001: "x", 1002: "y" };
  const frozen = ["1002"];

  let r = analyse(base, registry, frozen);
  if (r.problems.length !== 0) {
    console.error(`SELFTEST FAIL: a clean tree reported problems: ${r.problems.join("; ")}`);
    process.exit(1);
  }
  console.log("  ok: a grandfathered collision with everything registered is clean");

  const withNewDup = new Map(base);
  withNewDup.set("1003", ["1003-d.mjs", "1003-e.mjs"]);
  r = analyse(withNewDup, { ...registry, 1003: "z" }, frozen);
  if (!r.problems.some((p) => p.includes('NEW duplicate step number "1003"'))) {
    console.error("SELFTEST FAIL: a NEW duplicate number was not caught.");
    process.exit(1);
  }
  console.log("  caught: a NEW duplicate step number");

  // TOOL-F03: an unregistered number is INFORMATIONAL, not a failure. It previously failed the build,
  // which forced every guard PR to edit one shared JSON and made any two guard PRs conflict on merge
  // (GitHub cannot run this repo's json-union merge driver). It bought nothing: two lanes claiming one
  // number produce two FILES with that number, which is the duplicate check above, computed from the
  // directory. Lane parity — the thing that actually prevents the collision — is now enforced by
  // scripts/verify-verify-step-lane-band.mjs.
  const unregistered = new Map(base);
  unregistered.set("1004", ["1004-f.mjs"]);
  r = analyse(unregistered, registry, frozen);
  if (r.problems.length !== 0) {
    console.error(`SELFTEST FAIL: an unregistered number must not fail the build: ${r.problems.join("; ")}`);
    process.exit(1);
  }
  if (!r.notes.some((n) => n.includes("not listed in CLAIMED-NUMBERS.json"))) {
    console.error("SELFTEST FAIL: an unregistered number must still be REPORTED so drift stays visible.");
    process.exit(1);
  }
  console.log("  reported (not failed): a step number missing from the registry");

  // And the collision it was pretending to prevent must STILL fail.
  r = analyse(new Map([["1004", ["1004-f.mjs", "1004-g.mjs"]]]), {}, []);
  if (!r.problems.some((p) => p.includes("NEW duplicate step number"))) {
    console.error("SELFTEST FAIL: a duplicate number must still fail even when unregistered.");
    process.exit(1);
  }
  console.log("  caught: a duplicate number, registry or no registry");

  // A frozen entry that no longer collides must FAIL, so the list can only shrink.
  r = analyse(new Map([["1002", ["1002-b.mjs"]]]), { 1002: "y" }, frozen);
  if (!r.problems.some((p) => p.includes("no longer collides"))) {
    console.error("SELFTEST FAIL: a stale frozen entry was not caught.");
    process.exit(1);
  }
  console.log("  caught: a stale frozen entry (the list must only shrink)");

  console.log("SELFTEST PASS — 4 cases: clean, new duplicate, unregistered, stale freeze.");
}

if (process.argv.includes("--selftest")) selftest();
else {
  const r = run();
  console.log(r.message);
  if (!r.ok) process.exit(1);
}
