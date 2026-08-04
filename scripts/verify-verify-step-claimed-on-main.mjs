#!/usr/bin/env node
/**
 * Rule 25 claim-before-write (owner 2026-08-04, CC-2 analysis).
 *
 * A PR that ADDS scripts/verify-steps/NNNN-*.mjs FAILS unless NNNN is already
 * present in origin/main's CLAIMED-NUMBERS.json. Reservation must merge first
 * (chore/claim-reserve* or CLAIM-RESERVE / CLAIMED-REGEN subject) so two agents
 * cannot invent the same "free" number in parallel.
 *
 * Does not apply to claim-only PRs (no new verify-step files).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-verify-step-claimed-on-main";
const REGISTRY_REL = "scripts/verify-steps/CLAIMED-NUMBERS.json";
const SELFTEST = process.argv.includes("--selftest");

function git(args, cwd = ROOT) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr || r.stdout}`);
  return (r.stdout || "").trim();
}

export function newStepNumbers(baseRef = "origin/main", cwd = ROOT) {
  const out = git(
    ["diff", "--name-only", "--diff-filter=A", `${baseRef}...HEAD`, "--", "scripts/verify-steps/"],
    cwd,
  );
  const nums = [];
  for (const f of out.split("\n")) {
    const m = /^scripts\/verify-steps\/(\d+)-[^/]*\.mjs$/.exec(f.trim());
    if (m) nums.push({ file: f.trim(), number: m[1] });
  }
  return nums;
}

export function claimedNumbersFromJson(text) {
  const reg = JSON.parse(text);
  return new Set(Object.keys(reg.claimed ?? {}));
}

export function claimedNumbersOnRef(baseRef = "origin/main", cwd = ROOT) {
  const r = spawnSync("git", ["show", `${baseRef}:${REGISTRY_REL}`], { cwd, encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`${LABEL}: cannot read ${baseRef}:${REGISTRY_REL} — ${r.stderr || r.stdout}`);
  }
  return claimedNumbersFromJson(r.stdout);
}

/** Pure: given claimed set + new steps, return problems. */
/** One-time bootstrap: this guard may land with its own claim in the same PR. */
export const SELF_BOOTSTRAP_STEP = "2400-verify-verify-step-claimed-on-main.mjs";

export function analyseClaimedOnMain(claimedOnMain, steps, opts = {}) {
  const problems = [];
  const claimedOnHead = opts.claimedOnHead ?? claimedOnMain;
  const basename = (f) => f.split("/").pop();
  /** chore/claimed-regen* may land claim+file atomically (registry tooling only). */
  const regenSamePr = opts.regenSamePr === true;
  for (const s of steps) {
    if (claimedOnMain.has(s.number)) continue;
    if (
      basename(s.file) === SELF_BOOTSTRAP_STEP &&
      claimedOnHead.has(s.number) &&
      s.number === "2400"
    ) {
      continue; // self-bootstrap only for 2400 claim-before-write landing
    }
    if (regenSamePr && claimedOnHead.has(s.number)) {
      continue;
    }
    problems.push(
      `${s.file}: number ${s.number} is NOT in origin/main ${REGISTRY_REL}. ` +
        `Claim-before-write: merge a claim-reserve PR (chore/claim-reserve* or CLAIM-RESERVE) ` +
        `that only reserves this number, THEN author the guard file. Do not renumber after collisions.`,
    );
  }
  return problems;
}

/** CI often runs detached HEAD — prefer GITHUB_HEAD_REF / CLAIMED-REGEN subjects. */
export function resolveRegenSamePr(cwd = ROOT, baseRef = "origin/main") {
  const envBranch = (process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || "").trim();
  let branch = envBranch;
  if (!branch || branch === "HEAD" || branch === "main" || branch === "refs/heads/main") {
    try {
      const b = git(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
      if (b && b !== "HEAD") branch = b;
    } catch {
      /* ignore */
    }
  }
  if (branch.startsWith("chore/claimed-regen") || branch.startsWith("chore/claim-reserve")) {
    return true;
  }
  try {
    const subjects = git(["log", "--format=%s", `${baseRef}..HEAD`], cwd)
      .split("\n")
      .filter(Boolean);
    if (subjects.some((s) => /\bCLAIMED-REGEN\b|\bCLAIM-RESERVE\b/.test(s))) return true;
  } catch {
    /* ignore */
  }
  return false;
}

export function run(baseRef = "origin/main", cwd = ROOT) {
  const steps = newStepNumbers(baseRef, cwd);
  if (steps.length === 0) {
    return { ok: true, message: `${LABEL} OK — no new verify-step files` };
  }
  const claimed = claimedNumbersOnRef(baseRef, cwd);
  const headText = fs.readFileSync(path.join(cwd, REGISTRY_REL), "utf8");
  const claimedOnHead = claimedNumbersFromJson(headText);
  const regenSamePr = resolveRegenSamePr(cwd, baseRef);
  const problems = analyseClaimedOnMain(claimed, steps, { claimedOnHead, regenSamePr });
  return problems.length === 0
    ? { ok: true, message: `${LABEL} OK — ${steps.length} new step(s) already claimed on ${baseRef}` }
    : { ok: false, message: `${LABEL} FAILED (${problems.length}):\n  - ${problems.join("\n  - ")}` };
}

function selftest() {
  let bad = 0;
  const t = (name, cond) => {
    if (!cond) {
      console.error(`  SELFTEST FAIL: ${name}`);
      bad++;
    }
  };
  const claimed = new Set(["2400", "2402"]);
  t(
    "claimed passes",
    analyseClaimedOnMain(claimed, [{ file: "scripts/verify-steps/2400-x.mjs", number: "2400" }]).length === 0,
  );
  t(
    "unclaimed fails",
    analyseClaimedOnMain(claimed, [{ file: "scripts/verify-steps/2404-x.mjs", number: "2404" }]).length === 1,
  );
  t(
    "message names number",
    analyseClaimedOnMain(claimed, [{ file: "f", number: "9998" }])[0].includes("9998"),
  );
  t(
    "self-bootstrap 2400",
    analyseClaimedOnMain(new Set(), [{ file: `scripts/verify-steps/${SELF_BOOTSTRAP_STEP}`, number: "2400" }], {
      claimedOnHead: new Set(["2400"]),
    }).length === 0,
  );
  t(
    "bootstrap does not cover other numbers",
    analyseClaimedOnMain(new Set(), [{ file: "scripts/verify-steps/2402-x.mjs", number: "2402" }], {
      claimedOnHead: new Set(["2402"]),
    }).length === 1,
  );
  t(
    "claimed-regen same-PR allows claimed-on-head",
    analyseClaimedOnMain(new Set(), [{ file: "scripts/verify-steps/2402-x.mjs", number: "2402" }], {
      claimedOnHead: new Set(["2402"]),
      regenSamePr: true,
    }).length === 0,
  );
  t(
    "feature PR still needs main claim",
    analyseClaimedOnMain(new Set(), [{ file: "scripts/verify-steps/2402-x.mjs", number: "2402" }], {
      claimedOnHead: new Set(["2402"]),
      regenSamePr: false,
    }).length === 1,
  );
  const parsed = claimedNumbersFromJson(JSON.stringify({ claimed: { "10": "10-x.mjs" } }));
  t("parse claimed", parsed.has("10") && parsed.size === 1);
  return bad;
}

if (SELFTEST) {
  const bad = selftest();
  console.log(bad === 0 ? `${LABEL} SELFTEST PASS` : `${LABEL} SELFTEST FAILED (${bad})`);
  process.exit(bad === 0 ? 0 : 1);
}

const res = run();
console.log(res.message);
process.exit(res.ok ? 0 : 1);
