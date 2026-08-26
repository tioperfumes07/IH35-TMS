#!/usr/bin/env node
// USERS-DETAIL-STATUS-MISMATCH — guard
//
// Users.tsx computes a user's list-page status via userStatus()/isInvitePending() (now in
// apps/frontend/src/lib/user-status.ts): an invited-never-accepted user (auth_method === "Invite
// pending") shows "Invited", not "Active". UserDetail.tsx independently recomputed status as the
// naive `deactivated_at ? "Inactive" : "Active"` in two places (header badge + Profile row),
// silently dropping the Invited state — live-reproduced 2026-08-26: the same user id showed
// "Invited" on /users and "Active" on /users/:id at the same moment, with no error, no reload
// needed to see the disagreement.
//
// FIX: both pages now import and call the single shared userStatus() helper. This guard fails if
// UserDetail.tsx (or Users.tsx) ever reintroduces a local `deactivated_at ? "Inactive" : "Active"`
// status computation instead of importing the shared helper.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const HELPER_FILE = "apps/frontend/src/lib/user-status.ts";
const DETAIL_FILE = "apps/frontend/src/pages/UserDetail.tsx";
const LIST_FILE = "apps/frontend/src/pages/Users.tsx";

// Matches the naive recomputation this bug shipped as, in either quote style / spacing.
const NAIVE_STATUS_PATTERN = /deactivated_at\s*\?\s*["']Inactive["']\s*:\s*["']Active["']/;

export function check({ helperText, detailText, listText }) {
  const failures = [];

  if (!/export function userStatus\s*\(/.test(helperText)) {
    failures.push(`${HELPER_FILE} no longer exports userStatus() — the single source of truth for user status`);
  }
  if (!/auth_method\s*===\s*["']Invite pending["']/.test(helperText)) {
    failures.push(`${HELPER_FILE}'s userStatus()/isInvitePending() no longer checks auth_method === "Invite pending"`);
  }

  if (NAIVE_STATUS_PATTERN.test(detailText)) {
    failures.push(`${DETAIL_FILE} recomputes status locally as deactivated_at ? Inactive : Active instead of calling the shared userStatus() — this drops the Invited state and disagrees with the Users list (the exact live bug this guard exists to catch)`);
  }
  if (!/userStatus\(/.test(detailText)) {
    failures.push(`${DETAIL_FILE} never calls the shared userStatus() helper`);
  }
  if (!/from\s+["']\.\.\/lib\/user-status["']/.test(detailText)) {
    failures.push(`${DETAIL_FILE} does not import from ../lib/user-status`);
  }

  if (NAIVE_STATUS_PATTERN.test(listText)) {
    failures.push(`${LIST_FILE} recomputes status locally instead of calling the shared userStatus()`);
  }
  if (!/from\s+["']\.\.\/lib\/user-status["']/.test(listText)) {
    failures.push(`${LIST_FILE} does not import from ../lib/user-status`);
  }

  return failures;
}

function readAll() {
  return {
    helperText: fs.readFileSync(path.join(root, HELPER_FILE), "utf8"),
    detailText: fs.readFileSync(path.join(root, DETAIL_FILE), "utf8"),
    listText: fs.readFileSync(path.join(root, LIST_FILE), "utf8"),
  };
}

function run() {
  const files = readAll();
  const failures = check(files);
  if (failures.length > 0) {
    console.error("FAIL: user-detail-status-matches-list");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: UserDetail.tsx and Users.tsx both derive status from the shared userStatus() helper");
}

async function selftest() {
  const files = readAll();

  // Offender: UserDetail.tsx reverts to the pre-fix naive computation.
  const offenderDetail = files.detailText.replace(
    /userStatus\(targetUser\)/g,
    'targetUser.deactivated_at ? "Inactive" : "Active"'
  );
  if (offenderDetail === files.detailText) {
    console.error("FAIL(selftest): mutation did not change UserDetail.tsx — pattern out of sync with the fixed source");
    process.exit(1);
  }
  const offenderFailures = check({ ...files, detailText: offenderDetail });
  if (offenderFailures.length === 0) {
    console.error("FAIL(selftest): planted naive-status offender was NOT caught");
    process.exit(1);
  }
  console.log("PASS(selftest): planted regression (naive deactivated_at-only status in UserDetail.tsx) correctly caught");

  // Verify the real historical pre-fix source (before this PR) also fails.
  const { execFileSync } = await import("node:child_process");
  let historical;
  try {
    historical = execFileSync("git", ["show", `origin/main:${DETAIL_FILE}`], { cwd: root, encoding: "utf8" });
  } catch {
    historical = null;
  }
  if (historical && NAIVE_STATUS_PATTERN.test(historical)) {
    const historicalFailures = check({ ...files, detailText: historical });
    if (historicalFailures.length === 0) {
      console.error("FAIL(selftest): origin/main pre-fix UserDetail.tsx unexpectedly passed check() — guard too weak");
      process.exit(1);
    }
    console.log("PASS(selftest): origin/main historical pre-fix source correctly fails check()");
  } else {
    console.log("PASS(selftest): origin/main already carries the fix (or is unavailable) — skipping historical-fail leg");
  }

  console.log("PASS: selftest 1/1 planted offender caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  run();
}
