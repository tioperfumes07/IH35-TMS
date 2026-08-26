#!/usr/bin/env node
/**
 * GUARD — verify-driver-scheduler-leave-enum-humanized
 *
 * DRIVER-SCHEDULER-LEAVE-ENUM-RAW-DISPLAY: three Driver Scheduler office pages rendered the raw
 * snake_case `leave_type`/`status` columns (backend writes literal values like `pending_review`,
 * `wfh`) as visible UI text with a bare `String(...)`, never through the existing
 * `humanizeEnumLabel()` helper this codebase already uses 19+ other places for exactly this class
 * of bug. An operator reviewing a leave request would see "pending_review" printed on screen
 * instead of "Pending review". Confirmed via source read of apps/backend/src/safety/
 * driver-scheduler.service.ts (status values pending_review/approved/denied/deferred/cancelled
 * are written verbatim) — could not reproduce live in Chrome because the only writer
 * (POST /api/v1/driver/scheduler/request) requires a driver PWA session, not reachable from the
 * office Owner login, and safety.driver_leave_requests has zero rows in this environment.
 *
 * METHOD: static source-text assertions on the three touched files. --selftest mutates each REAL
 * file and requires the offender to be caught.
 */
import { readFileSync } from "node:fs";

const LABEL = "verify-driver-scheduler-leave-enum-humanized";
const DETAIL = "apps/frontend/src/pages/safety/driver-scheduler/DriverSchedulerRequestDetailPage.tsx";
const GRID = "apps/frontend/src/pages/safety/driver-scheduler/DriverSchedulerGridPage.tsx";
const INBOX = "apps/frontend/src/pages/safety/driver-scheduler/DriverSchedulerRequestInboxPage.tsx";

export function check(detailText, gridText, inboxText) {
  const problems = [];

  if (!/import \{ humanizeEnumLabel \} from "..\/..\/..\/lib\/humanizeEnumLabel"/.test(detailText)) {
    problems.push(`${DETAIL}: does not import humanizeEnumLabel.`);
  }
  if (!/humanizeEnumLabel\(req\.leave_type\)/.test(detailText)) {
    problems.push(`${DETAIL}: Type field still not humanized.`);
  }
  if (!/humanizeEnumLabel\(req\.status\)/.test(detailText)) {
    problems.push(`${DETAIL}: Status field still not humanized.`);
  }
  // The logic comparison must stay raw — never humanize a value used for an equality check.
  if (!/String\(req\.status\) === "pending_review"/.test(detailText)) {
    problems.push(`${DETAIL}: the raw status equality check for review-actions gating is missing or was altered.`);
  }

  if (!/import \{ humanizeEnumLabel \} from "..\/..\/..\/lib\/humanizeEnumLabel"/.test(gridText)) {
    problems.push(`${GRID}: does not import humanizeEnumLabel.`);
  }
  if (!/title=\{lt \? humanizeEnumLabel\(lt\) : ""\}/.test(gridText)) {
    problems.push(`${GRID}: grid-cell tooltip still discloses the raw leave_type value.`);
  }
  if (!/humanizeEnumLabel\(p\.leave_type\)/.test(gridText)) {
    problems.push(`${GRID}: "Pending in this window" list still not humanized.`);
  }

  if (!/import \{ humanizeEnumLabel \} from "..\/..\/..\/lib\/humanizeEnumLabel"/.test(inboxText)) {
    problems.push(`${INBOX}: does not import humanizeEnumLabel.`);
  }
  if (!/render: \(r\) => humanizeEnumLabel\(r\.leave_type\)/.test(inboxText)) {
    problems.push(`${INBOX}: ParityTable "Type" column still not humanized.`);
  }

  return problems;
}

function run() {
  const detailText = readFileSync(DETAIL, "utf8");
  const gridText = readFileSync(GRID, "utf8");
  const inboxText = readFileSync(INBOX, "utf8");
  const problems = check(detailText, gridText, inboxText);
  if (problems.length) {
    console.error(`${LABEL} FAILED:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — leave_type/status render through humanizeEnumLabel on all 3 Driver Scheduler office pages; logic comparisons stay raw.`);
}

function selftest() {
  const detailReal = readFileSync(DETAIL, "utf8");
  const gridReal = readFileSync(GRID, "utf8");
  const inboxReal = readFileSync(INBOX, "utf8");
  const failures = [];

  const baseline = check(detailReal, gridReal, inboxReal);
  if (baseline.length) failures.push(`baseline (real fixed files) should pass, got: ${baseline.join(" | ")}`);

  // Offender 1: detail page Type field reverted to raw String(...).
  const d1 = detailReal.replace("humanizeEnumLabel(req.leave_type)", "String(req.leave_type)");
  const p1 = check(d1, gridReal, inboxReal);
  if (!p1.some((m) => m.includes("Type field still not humanized"))) {
    failures.push(`offender-1 (detail Type reverted) NOT caught: ${p1.join(" | ") || "none"}`);
  }

  // Offender 2: detail page Status field reverted.
  const d2 = detailReal.replace("humanizeEnumLabel(req.status)", "String(req.status)");
  const p2 = check(d2, gridReal, inboxReal);
  if (!p2.some((m) => m.includes("Status field still not humanized"))) {
    failures.push(`offender-2 (detail Status reverted) NOT caught: ${p2.join(" | ") || "none"}`);
  }

  // Offender 3: grid tooltip reverted to raw.
  const g1 = gridReal.replace('title={lt ? humanizeEnumLabel(lt) : ""}', 'title={lt ?? ""}');
  const p3 = check(detailReal, g1, inboxReal);
  if (!p3.some((m) => m.includes("tooltip still discloses"))) {
    failures.push(`offender-3 (grid tooltip reverted) NOT caught: ${p3.join(" | ") || "none"}`);
  }

  // Offender 4: grid "Pending in this window" list reverted.
  const g2 = gridReal.replace("humanizeEnumLabel(p.leave_type)", "String(p.leave_type)");
  const p4 = check(detailReal, g2, inboxReal);
  if (!p4.some((m) => m.includes('"Pending in this window" list still not humanized'))) {
    failures.push(`offender-4 (grid pending list reverted) NOT caught: ${p4.join(" | ") || "none"}`);
  }

  // Offender 5: inbox ParityTable column reverted.
  const i1 = inboxReal.replace("render: (r) => humanizeEnumLabel(r.leave_type)", "render: (r) => String(r.leave_type)");
  const p5 = check(detailReal, gridReal, i1);
  if (!p5.some((m) => m.includes('ParityTable "Type" column still not humanized'))) {
    failures.push(`offender-5 (inbox column reverted) NOT caught: ${p5.join(" | ") || "none"}`);
  }

  // Offender 6: the raw logic comparison accidentally humanized (would silently break review-action gating).
  const d3 = detailReal.replace(
    'String(req.status) === "pending_review"',
    'humanizeEnumLabel(req.status) === "Pending review"'
  );
  const p6 = check(d3, gridReal, inboxReal);
  if (!p6.some((m) => m.includes("equality check for review-actions gating"))) {
    failures.push(`offender-6 (logic comparison humanized) NOT caught: ${p6.join(" | ") || "none"}`);
  }

  if (failures.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS — 6/6 offenders caught, baseline clean`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
