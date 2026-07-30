#!/usr/bin/env node
/**
 * TOOL-F03 — verify-step numbers come from a RESERVED PER-LANE PARITY. Claude claims ODD, Cursor
 * claims EVEN (owner ruling 2026-07-28, recorded in .cursor/rules/25-verify-step-odd-even-bands.mdc
 * and in CLAIMED-NUMBERS.json's own `_how_to_claim`).
 *
 * WHY THIS GUARD EXISTS. Migrations have had `verify-migration-lane-band.mjs` enforcing their bands
 * since 2026-07-28. Verify-step numbers had the SAME owner ruling and NO enforcement — the parity was
 * a rule in a document, honoured by hand. The only mechanical thing standing near it was
 * CLAIMED-NUMBERS.json, which every guard PR had to hand-edit to restate a number the FILENAME already
 * declares. That restatement bought no safety (uniqueness is computed from the directory in
 * verify-verify-step-numbers-unique.mjs) and cost a guaranteed merge conflict on every guard PR from
 * either agent, because GitHub cannot run this repo's json-union merge driver.
 *
 * So: enforce the invariant mechanically here, and the registry stops being load-bearing ceremony.
 * With parity enforced by branch prefix, the two lanes CANNOT pick the same number.
 *
 * Scope: NEW step files only (added on this branch vs origin/main). Existing steps are grandfathered —
 * renumbering a wired step would break its CI wiring for no gain.
 * Unmapped branch (not clearly one lane's) -> SKIP rather than guess, same as the migration guard.
 */
import { spawnSync } from "node:child_process";

const LANES = [
  { lane: "claude", branchPrefixes: ["claude/"], parity: 1, label: "ODD" },
  {
    lane: "cursor",
    branchPrefixes: ["cursor/", "cursoragent/", "chore/", "feat/", "fix/"],
    parity: 0,
    label: "EVEN",
  },
];

const LABEL = "verify:verify-step-lane-band";

function git(args) {
  const r = spawnSync("git", args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr || r.stdout}`);
  return (r.stdout || "").trim();
}

export function laneForBranch(branch) {
  for (const l of LANES) {
    if (l.branchPrefixes.some((p) => branch.startsWith(p))) return l;
  }
  return null;
}

/** Step numbers newly ADDED on this branch relative to the base. */
export function newStepNumbers(baseRef = "origin/main") {
  const out = git([
    "diff",
    "--name-only",
    "--diff-filter=A",
    `${baseRef}...HEAD`,
    "--",
    "scripts/verify-steps/",
  ]);
  const nums = [];
  for (const f of out.split("\n")) {
    const m = /^scripts\/verify-steps\/(\d+)-[^/]*\.mjs$/.exec(f.trim());
    if (m) nums.push({ file: f.trim(), number: m[1] });
  }
  return nums;
}

/** Pure, so both directions are testable without a git repo. */
export function analyse(lane, steps) {
  if (!lane) return { skipped: true, problems: [] };
  const problems = [];
  for (const s of steps) {
    const n = Number(s.number);
    if (!Number.isFinite(n)) continue;
    if (n % 2 !== lane.parity) {
      problems.push(
        `${s.file} claims ${s.number}, which is ${n % 2 === 1 ? "ODD" : "EVEN"} — the ${lane.lane} lane claims ${lane.label} only. ` +
          `Two lanes writing outside their parity is how they collide on one number.`
      );
    }
  }
  return { skipped: false, problems };
}

export function run(baseRef = "origin/main") {
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  const lane = laneForBranch(branch);
  if (!lane) {
    return { ok: true, message: `${LABEL} SKIP — branch "${branch}" maps to no lane; not guessing.` };
  }
  const steps = newStepNumbers(baseRef);
  if (steps.length === 0) {
    return { ok: true, message: `${LABEL} OK — no new verify-steps on ${branch}` };
  }
  const { problems } = analyse(lane, steps);
  return problems.length === 0
    ? {
        ok: true,
        message: `${LABEL} OK — ${steps.length} new step(s) all inside the ${lane.lane} band (${lane.label})`,
      }
    : { ok: false, message: `${LABEL} FAILED (${problems.length}):\n  - ${problems.join("\n  - ")}` };
}

function selftest() {
  const claude = LANES[0];
  const cursor = LANES[1];
  let bad = 0;
  const t = (name, cond) => {
    if (!cond) {
      console.error(`  SELFTEST FAIL: ${name}`);
      bad++;
    }
  };

  t("claude ODD passes", analyse(claude, [{ file: "f", number: "1799" }]).problems.length === 0);
  t("claude EVEN fails", analyse(claude, [{ file: "f", number: "1800" }]).problems.length === 1);
  t("cursor EVEN passes", analyse(cursor, [{ file: "f", number: "1800" }]).problems.length === 0);
  t("cursor ODD fails", analyse(cursor, [{ file: "f", number: "1799" }]).problems.length === 1);
  t("no lane -> skipped", analyse(null, [{ file: "f", number: "1800" }]).skipped === true);
  t("branch prefix maps claude", laneForBranch("claude/anything")?.lane === "claude");
  t("branch prefix maps cursor", laneForBranch("cursor/anything")?.lane === "cursor");
  t("unknown prefix maps nothing", laneForBranch("wip/whatever") === null);
  // The message must name the number, or a failure is unactionable.
  t(
    "failure names the offending number",
    analyse(claude, [{ file: "f", number: "1800" }]).problems[0].includes("1800")
  );
  return bad;
}

if (process.argv.includes("--selftest")) {
  const bad = selftest();
  console.log(bad === 0 ? `${LABEL} SELFTEST PASS — 9 cases` : `${LABEL} SELFTEST FAILED (${bad})`);
  process.exit(bad === 0 ? 0 : 1);
}

const res = run();
console.log(res.message);
process.exit(res.ok ? 0 : 1);
