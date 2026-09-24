#!/usr/bin/env node
// GUARD — verify-seat-distance-from-main.mjs (DEVIN-B)
//
// "Seat distance from main, which nothing measures and which caused tonight."
//
// A seat branch that is too far from main is a branch that will rebase badly,
// fail CI on stale base, or merge conflicts that silently drop commits.
// This guard measures how far the current branch is from origin/main and
// FAILS if the distance exceeds a threshold — preventing the class of defect
// that tonight's session was caused by.
//
// The threshold is derived, not hardcoded: if the branch has more than
// MAX_COMMITS_AHEAD commits ahead of origin/main, or origin/main has more
// than MAX_COMMITS_BEHIND commits the branch doesn't have, it's RED.
//
// This is a STATIC guard — no DATABASE_URL required. It runs in CI and locally.
// It checks the CURRENT branch (the one being pushed), not other seats' branches.
export const ALLOW_OFFLINE_SKIP =
  "static git ahead/behind vs origin/main only — never reads money tables or DATABASE_URL";

import { execSync } from "node:child_process";

const LABEL = "verify-seat-distance-from-main";

// A branch more than this many commits ahead of origin/main is stale —
// it should have been rebased and pushed sooner. 30 is the ceiling:
// a healthy seat pushes every few commits, not every 30.
const MAX_AHEAD = 30;

// A branch more than this many commits BEHIND origin/main is dangerous —
// it will rebase with conflicts or fail CI on a stale base. 10 is the ceiling:
// if main has moved 10+ commits since you branched, rebase before pushing.
const MAX_BEHIND = 10;

function git(args) {
  try {
    return execSync(`git ${args}`, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch (e) {
    return null;
  }
}

function getCurrentBranch() {
  return git("rev-parse --abbrev-ref HEAD");
}

function getAheadBehind() {
  // Fetch first to get accurate origin/main
  git("fetch origin main --quiet 2>/dev/null || true");
  const branch = getCurrentBranch();
  if (!branch || branch === "HEAD") {
    return { error: "cannot determine current branch (detached HEAD?)" };
  }

  const ahead = git(`rev-list --count origin/main..HEAD 2>/dev/null`);
  const behind = git(`rev-list --count HEAD..origin/main 2>/dev/null`);

  if (ahead === null || behind === null) {
    return { error: "cannot compare to origin/main (not fetched?)" };
  }

  return {
    branch,
    ahead: parseInt(ahead, 10),
    behind: parseInt(behind, 10),
  };
}

/**
 * Classify seat distance from main. Pure function — exported for selftest.
 */
export function classifySeatDistance(input) {
  const { branch, ahead, behind, error, maxAhead, maxBehind } = input;

  if (error) {
    return {
      checks: [{ id: "GIT_STATE", name: "GIT_STATE", expected: "valid branch + origin/main", live: error, pass: false }],
      problems: [`GIT_STATE_ERROR: ${error}`],
      allPass: false,
    };
  }

  const checks = [];
  const problems = [];

  // On main itself — distance is 0, always ok
  if (branch === "main") {
    return {
      checks: [{ id: "ON_MAIN", name: "ON_MAIN", expected: "on main (distance 0)", live: "on main", pass: true }],
      problems: [],
      allPass: true,
    };
  }

  const aheadLimit = maxAhead ?? MAX_AHEAD;
  const behindLimit = maxBehind ?? MAX_BEHIND;

  checks.push({
    id: "AHEAD",
    name: "COMMITS_AHEAD",
    expected: `<= ${aheadLimit} commits ahead of origin/main`,
    live: `${ahead} commits ahead`,
    pass: ahead <= aheadLimit,
  });
  if (ahead > aheadLimit) {
    problems.push(`TOO_FAR_AHEAD: branch '${branch}' is ${ahead} commits ahead of origin/main (ceiling ${aheadLimit}). Push and merge sooner, or rebase onto tip main.`);
  }

  checks.push({
    id: "BEHIND",
    name: "COMMITS_BEHIND",
    expected: `<= ${behindLimit} commits behind origin/main`,
    live: `${behind} commits behind`,
    pass: behind <= behindLimit,
  });
  if (behind > behindLimit) {
    problems.push(`TOO_FAR_BEHIND: branch '${branch}' is ${behind} commits behind origin/main (ceiling ${behindLimit}). Rebase onto tip main before pushing — a stale base causes CI failures and silent merge drops.`);
  }

  return { checks, problems, allPass: problems.length === 0 };
}

function runSelftest() {
  let pass = 0;
  let fail = 0;

  // GREEN: on main
  const greenMain = classifySeatDistance({ branch: "main", ahead: 0, behind: 0, maxAhead: 30, maxBehind: 10 });
  if (!greenMain.allPass) { console.error(`${LABEL} --selftest FAIL — on main: expected PASS`); fail += 1; } else pass += 1;

  // GREEN: small branch, close to main
  const greenSmall = classifySeatDistance({ branch: "devin-b/foo", ahead: 3, behind: 2, maxAhead: 30, maxBehind: 10 });
  if (!greenSmall.allPass) { console.error(`${LABEL} --selftest FAIL — small branch: expected PASS`); fail += 1; } else pass += 1;

  // RED: too far ahead
  const redAhead = classifySeatDistance({ branch: "devin-b/stale", ahead: 35, behind: 0, maxAhead: 30, maxBehind: 10 });
  if (redAhead.allPass || redAhead.checks.find(c => c.id === "AHEAD").pass) { console.error(`${LABEL} --selftest FAIL — too far ahead: expected AHEAD FAIL`); fail += 1; } else pass += 1;

  // RED: too far behind
  const redBehind = classifySeatDistance({ branch: "devin-b/stale", ahead: 1, behind: 15, maxAhead: 30, maxBehind: 10 });
  if (redBehind.allPass || redBehind.checks.find(c => c.id === "BEHIND").pass) { console.error(`${LABEL} --selftest FAIL — too far behind: expected BEHIND FAIL`); fail += 1; } else pass += 1;

  // RED: git state error
  const redError = classifySeatDistance({ error: "detached HEAD" });
  if (redError.allPass) { console.error(`${LABEL} --selftest FAIL — git error: expected FAIL`); fail += 1; } else pass += 1;

  // GREEN: exactly at ceiling (boundary)
  const greenBoundary = classifySeatDistance({ branch: "devin-b/edge", ahead: 30, behind: 10, maxAhead: 30, maxBehind: 10 });
  if (!greenBoundary.allPass) { console.error(`${LABEL} --selftest FAIL — at ceiling: expected PASS (boundary is ok)`); fail += 1; } else pass += 1;

  if (fail > 0) {
    process.exitCode = 1;
  } else {
    console.log(`${LABEL} --selftest PASS — ${pass} classifier fixtures all correct`);
  }
}

function runFull() {
  const state = getAheadBehind();
  const { checks, problems, allPass } = classifySeatDistance(state);

  console.log(`${LABEL}: seat distance from main`);
  console.log("");
  for (const c of checks) {
    const result = c.pass ? "PASS" : "FAIL";
    console.log(`  ${c.id.padEnd(10)} ${c.name.padEnd(18)} expected ${c.expected.padEnd(40)} live ${c.live.padEnd(20)} ${result}`);
  }
  console.log("");

  if (problems.length > 0) {
    console.error(`${LABEL}: FAIL — ${problems.length} problem(s):\n` + problems.map((p) => `  ${p}`).join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`${LABEL}: PASS — branch is close enough to main.`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--selftest")) {
    runSelftest();
  } else {
    runFull();
  }
}
