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
  for (const n of unregistered) {
    problems.push(
      `step number "${n}" (${groups.get(n).join(", ")}) is NOT in CLAIMED-NUMBERS.json — unregistered numbers ` +
        `are how two lanes claim the same one.`
    );
  }

  return { problems, duplicates, newDuplicates, staleFrozen, unregistered };
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

  const unregistered = new Map(base);
  unregistered.set("1004", ["1004-f.mjs"]);
  r = analyse(unregistered, registry, frozen);
  if (!r.problems.some((p) => p.includes('"1004"') && p.includes("NOT in CLAIMED-NUMBERS"))) {
    console.error("SELFTEST FAIL: an unregistered step number was not caught.");
    process.exit(1);
  }
  console.log("  caught: a step number missing from the registry");

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
