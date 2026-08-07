#!/usr/bin/env node
/**
 * TOOL-F03 / Rule 25 (2026-08-04) — verify-step lane bands by mod-4.
 *
 *   Cursor  → EVEN          (n % 2 === 0)
 *   CC-1    → ≡ 1 (mod 4)   (claude/, cc-1/, cc1/)
 *   CC-2    → ≡ 3 (mod 4)   (cc-2/, cc2/)
 *
 * Two Claude lanes both drawing plain ODD caused three collisions in one day.
 * Mod-4 makes CC-1 and CC-2 disjoint. Credit: CC-2 analysis.
 */
import { spawnSync } from "node:child_process";

const LANES = [
  {
    lane: "cc-1",
    branchPrefixes: ["claude/", "cc-1/", "cc1/"],
    /** n % 4 === 1 */
    ok: (n) => n % 4 === 1,
    label: "≡1 (mod 4)",
  },
  {
    lane: "cc-2",
    branchPrefixes: ["cc-2/", "cc2/"],
    /** n % 4 === 3 */
    ok: (n) => n % 4 === 3,
    label: "≡3 (mod 4)",
  },
  {
    lane: "cursor",
    branchPrefixes: ["cursor/", "cursoragent/", "chore/", "feat/", "fix/"],
    ok: (n) => n % 2 === 0,
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
  // Prefer more-specific prefixes first (cc-2 before claude is already ordered by LANES).
  for (const l of LANES) {
    if (l.branchPrefixes.some((p) => branch.startsWith(p))) return l;
  }
  return null;
}

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

export function analyse(lane, steps) {
  if (!lane) return { skipped: true, problems: [] };
  const problems = [];
  for (const s of steps) {
    const n = Number(s.number);
    if (!Number.isFinite(n)) continue;
    if (!lane.ok(n)) {
      problems.push(
        `${s.file} claims ${s.number} (n%4=${n % 4}, ${n % 2 === 0 ? "EVEN" : "ODD"}) — ` +
          `the ${lane.lane} lane claims ${lane.label} only. ` +
          `CC-1≡1 · CC-2≡3 · Cursor EVEN (Rule 25 / 2026-08-04).`,
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
  const cc1 = LANES[0];
  const cc2 = LANES[1];
  const cursor = LANES[2];
  let bad = 0;
  const t = (name, cond) => {
    if (!cond) {
      console.error(`  SELFTEST FAIL: ${name}`);
      bad++;
    }
  };

  t("cc-1 ≡1 passes", analyse(cc1, [{ file: "f", number: "2401" }]).problems.length === 0);
  t("cc-1 ≡3 fails", analyse(cc1, [{ file: "f", number: "2403" }]).problems.length === 1);
  t("cc-1 EVEN fails", analyse(cc1, [{ file: "f", number: "2400" }]).problems.length === 1);
  t("cc-2 ≡3 passes", analyse(cc2, [{ file: "f", number: "2403" }]).problems.length === 0);
  t("cc-2 ≡1 fails", analyse(cc2, [{ file: "f", number: "2401" }]).problems.length === 1);
  t("cursor EVEN passes", analyse(cursor, [{ file: "f", number: "2400" }]).problems.length === 0);
  t("cursor ODD fails", analyse(cursor, [{ file: "f", number: "2401" }]).problems.length === 1);
  t("no lane -> skipped", analyse(null, [{ file: "f", number: "2400" }]).skipped === true);
  t("branch maps claude → cc-1", laneForBranch("claude/money")?.lane === "cc-1");
  t("branch maps cc-1", laneForBranch("cc-1/foo")?.lane === "cc-1");
  t("branch maps cc-2", laneForBranch("cc-2/foo")?.lane === "cc-2");
  t("branch maps cursor", laneForBranch("cursor/anything")?.lane === "cursor");
  t("unknown prefix maps nothing", laneForBranch("wip/whatever") === null);
  t(
    "failure names the offending number",
    analyse(cc1, [{ file: "f", number: "2400" }]).problems[0].includes("2400"),
  );
  return bad;
}

if (process.argv.includes("--selftest")) {
  const bad = selftest();
  console.log(bad === 0 ? `${LABEL} SELFTEST PASS — 14 cases` : `${LABEL} SELFTEST FAILED (${bad})`);
  process.exit(bad === 0 ? 0 : 1);
}

const res = run();
console.log(res.message);
process.exit(res.ok ? 0 : 1);
