#!/usr/bin/env node
/**
 * TOOL-F03 / Rule 25 (2026-08-04) — verify-step lane bands by mod-4.
 *
 *   Cursor  → EVEN          (n % 2 === 0)
 *   CC-1    → ≡ 1 (mod 4)   (claude/, cc-1/, cc1/)
 *   CC-2    → ≡ 3 (mod 4)   (cc-2/, cc2/)
 *
 * 2026-08-29 rider: chrome-only seats (cc-3/, codex/, cascade/, devin*, audit/)
 * and any unmapped prefix FAIL CLOSED if they add a new verify-step (no silent SKIP).
 * Chrome + TEST work needs no new steps — nothing stalls.
 */
import { spawnSync } from "node:child_process";

const LANES = [
  {
    lane: "cc-1",
    branchPrefixes: ["claude/", "cc-1/", "cc1/"],
    /** n % 4 === 1 */
    ok: (n) => n % 4 === 1,
    label: "≡1 (mod 4)",
    authorSteps: true,
  },
  {
    lane: "cc-2",
    branchPrefixes: ["cc-2/", "cc2/"],
    /** n % 4 === 3 */
    ok: (n) => n % 4 === 3,
    label: "≡3 (mod 4)",
    authorSteps: true,
  },
  {
    lane: "cursor",
    branchPrefixes: ["cursor/", "cursoragent/", "chore/", "feat/", "fix/"],
    ok: (n) => n % 2 === 0,
    label: "EVEN",
    authorSteps: true,
  },
  {
    lane: "chrome-only",
    branchPrefixes: [
      "cc-3/",
      "cc3/",
      "codex/",
      "cascade/",
      "devin/",
      "devin-a/",
      "devina/",
      "audit/",
    ],
    ok: () => false,
    label: "chrome-only (no new verify-steps)",
    authorSteps: false,
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
  if (lane.authorSteps === false && steps.length > 0) {
    for (const s of steps) {
      problems.push(
        `${s.file} — lane "${lane.lane}" is chrome-only (${lane.label}). ` +
          `Author no new verify-steps; chrome + TEST creates need neither. ` +
          `Cursor/CC-1 must adopt the guard on a banded branch if a step is required.`,
      );
    }
    return { skipped: false, problems };
  }
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
  const steps = newStepNumbers(baseRef);

  if (!lane) {
    if (steps.length > 0) {
      return {
        ok: false,
        message:
          `${LABEL} FAILED — branch "${branch}" maps to no lane but adds ${steps.length} verify-step(s). ` +
          `Unmapped prefixes must not author steps (silent SKIP was a collision hazard). ` +
          `Use a mapped prefix or drop the step file. Known: claude/cc-1 · cc-2 · cursor · chrome-only seats.`,
      };
    }
    return {
      ok: true,
      message: `${LABEL} OK — branch "${branch}" unmapped but no new verify-steps (chrome-safe).`,
    };
  }

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
  const chrome = LANES[3];
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
  t("chrome-only rejects any step", analyse(chrome, [{ file: "f", number: "2400" }]).problems.length === 1);
  t("analyse(null) still skipped marker", analyse(null, [{ file: "f", number: "2400" }]).skipped === true);
  t("branch maps claude → cc-1", laneForBranch("claude/money")?.lane === "cc-1");
  t("branch maps cc-1", laneForBranch("cc-1/foo")?.lane === "cc-1");
  t("branch maps cc-2", laneForBranch("cc-2/foo")?.lane === "cc-2");
  t("branch maps cursor", laneForBranch("cursor/anything")?.lane === "cursor");
  t("branch maps cc-3 → chrome-only", laneForBranch("cc-3/lists")?.lane === "chrome-only");
  t("branch maps codex → chrome-only", laneForBranch("codex/dispatch")?.lane === "chrome-only");
  t("branch maps cascade → chrome-only", laneForBranch("cascade/audit")?.lane === "chrome-only");
  t("branch maps devin → chrome-only", laneForBranch("devin/vendors")?.lane === "chrome-only");
  t("branch maps audit → chrome-only", laneForBranch("audit/cc3-guard")?.lane === "chrome-only");
  t("unknown prefix maps nothing", laneForBranch("wip/whatever") === null);
  t(
    "failure names the offending number",
    analyse(cc1, [{ file: "f", number: "2400" }]).problems[0].includes("2400"),
  );
  // Every known prefix maps to exactly one lane
  const known = [
    "claude/x",
    "cc-1/x",
    "cc1/x",
    "cc-2/x",
    "cc2/x",
    "cursor/x",
    "cc-3/x",
    "codex/x",
    "cascade/x",
    "devin/x",
    "devin-a/x",
    "audit/x",
  ];
  for (const b of known) {
    t(`known prefix maps once: ${b}`, laneForBranch(b) !== null);
  }
  return bad;
}

if (process.argv.includes("--selftest")) {
  const bad = selftest();
  console.log(bad === 0 ? `${LABEL} SELFTEST PASS` : `${LABEL} SELFTEST FAILED (${bad})`);
  process.exit(bad === 0 ? 0 : 1);
}

const res = run();
console.log(res.message);
process.exit(res.ok ? 0 : 1);
