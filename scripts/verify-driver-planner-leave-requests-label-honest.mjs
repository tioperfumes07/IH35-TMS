#!/usr/bin/env node
/**
 * GUARD: Dispatch Planner's link to the driver leave-request review queue must not claim to be a
 * creator.
 *
 * WHY THIS EXISTS (DISPATCH-PLANNER-REQUEST-TIME-OFF-LINKS-TO-REVIEW-QUEUE-NOT-A-CREATOR):
 * `DriverPlanner.tsx` used to label this link "+ Request time off" — this app's own convention
 * reserves a "+" prefix for real creators (Combobox/EntityPicker "+ Add new X", "+ Create Bill",
 * etc.). But the link's destination, `DriverSchedulerRequestInboxPage.tsx`
 * (`/safety/scheduler/pending-requests`), is a pure review/approve inbox for requests a DRIVER
 * already submitted — its own API client (`driverSchedulerOfficeApi`) has no create function, and
 * the only leave-request-creating backend route (`POST /api/v1/driver/scheduler/request`) lives
 * under the driver-app API prefix, not the office prefix this page otherwise uses. An office user
 * clicking a "+"-labelled link that cannot create anything is exactly the chrome-honesty violation
 * this guard exists to catch.
 *
 * Usage: node scripts/verify-driver-planner-leave-requests-label-honest.mjs
 *        node scripts/verify-driver-planner-leave-requests-label-honest.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-driver-planner-leave-requests-label-honest";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLANNER_FILE = path.join(ROOT, "apps/frontend/src/pages/dispatch/planners/DriverPlanner.tsx");
const INBOX_FILE = path.join(ROOT, "apps/frontend/src/pages/safety/driver-scheduler/DriverSchedulerRequestInboxPage.tsx");
const API_FILE = path.join(ROOT, "apps/frontend/src/api/driver-scheduler.ts");

/**
 * @param {string} plannerSrc
 * @param {string} inboxSrc
 * @param {string} apiSrc
 */
export function checkHonestLabel(plannerSrc, inboxSrc, apiSrc) {
  const problems = [];

  // The link must still point at the review queue — this guard is about the LABEL, not removing
  // the (legitimate, useful) navigation.
  const linkMatch = plannerSrc.match(/<Link\s+to="\/safety\/scheduler\/pending-requests"[^>]*>([\s\S]{0,120}?)<\/Link>/);
  if (!linkMatch) {
    problems.push("could not locate the Link to /safety/scheduler/pending-requests in DriverPlanner.tsx — did the route change?");
    return problems;
  }
  const labelText = linkMatch[1].replace(/\{\/\*[\s\S]*?\*\/\}/g, "").trim();

  // The core assertion: no "+"-prefixed label on a link whose destination cannot create anything.
  if (/^\+/.test(labelText)) {
    problems.push(
      `DriverPlanner.tsx's link to the review-only leave-request inbox is labelled "${labelText}" — ` +
        `a "+" prefix implies this app's create-button convention, but the destination page has no ` +
        `create capability (confirmed below). Drop the "+" or point it at a real creator.`,
    );
  }

  // Confirm the premise still holds: the destination truly has no create action, and the office
  // API client truly has no create function. If either becomes true, this guard's rationale is
  // stale and should be revisited (not silently left rejecting a since-fixed gap).
  const inboxHasCreateAction = /\bcreateLeaveRequest\b/i.test(inboxSrc) || /"?\+\s*(Create|New|Request)\b/i.test(inboxSrc);
  if (inboxHasCreateAction) {
    problems.push(
      "DriverSchedulerRequestInboxPage.tsx now appears to have a create action — if a real " +
        "office-side create flow was added, the DriverPlanner.tsx label should say so (e.g. " +
        '"+ Request time off") instead of the honest-but-now-stale "Leave Requests".',
    );
  }
  if (/createLeaveRequest/i.test(apiSrc)) {
    problems.push("driverSchedulerOfficeApi now exposes a createLeaveRequest function — re-evaluate whether the DriverPlanner link should use a creator label again.");
  }

  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];

  // 1. The regression shape: the old dishonest "+" label must be caught.
  let problems = checkHonestLabel(
    `<Link to="/safety/scheduler/pending-requests">+ Request time off</Link>`,
    `export function DriverSchedulerRequestInboxPage() { return null; }`,
    `export const driverSchedulerOfficeApi = { listPending() {} };`,
  );
  if (!problems.some((p) => p.includes("implies this app's create-button convention"))) {
    failures.push("selftest 1: dishonest '+' label not caught");
  }

  // 2. The honest label (current fix) must pass clean.
  problems = checkHonestLabel(
    `<Link to="/safety/scheduler/pending-requests">Leave Requests</Link>`,
    `export function DriverSchedulerRequestInboxPage() { return null; }`,
    `export const driverSchedulerOfficeApi = { listPending() {} };`,
  );
  if (problems.length !== 0) failures.push(`selftest 2: honest label falsely flagged: ${problems.join("; ")}`);

  // 3. A comment block inside the Link (like the real fix's own explanatory comment) must not be
  //    mistaken for the label text.
  problems = checkHonestLabel(
    `<Link to="/safety/scheduler/pending-requests">{/* CHROME-HONESTY: explains the fix */}\n  Leave Requests\n</Link>`,
    `export function DriverSchedulerRequestInboxPage() { return null; }`,
    `export const driverSchedulerOfficeApi = { listPending() {} };`,
  );
  if (problems.length !== 0) failures.push(`selftest 3: comment-prefixed honest label falsely flagged: ${problems.join("; ")}`);

  // 4. If the destination gains a real create action, the guard should flag the (now stale) honest
  //    label as needing review — proves the guard checks the premise, not just the label string.
  problems = checkHonestLabel(
    `<Link to="/safety/scheduler/pending-requests">Leave Requests</Link>`,
    `export const createLeaveRequest = () => {};`,
    `export const driverSchedulerOfficeApi = { listPending() {} };`,
  );
  if (!problems.some((p) => p.includes("now appears to have a create action"))) {
    failures.push("selftest 4: stale-premise (destination gained a create action) not caught");
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  ${failures.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK — planted regressions caught, honest label and comment-prefixed label both pass clean`);
  process.exit(0);
}

const plannerSrc = fs.readFileSync(PLANNER_FILE, "utf8");
const inboxSrc = fs.readFileSync(INBOX_FILE, "utf8");
const apiSrc = fs.readFileSync(API_FILE, "utf8");
const problems = checkHonestLabel(plannerSrc, inboxSrc, apiSrc);

if (problems.length) {
  console.error(`${LABEL} FAILED:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}

console.log(`${LABEL} OK — DriverPlanner's leave-request link label is honest about its (review-only) capability`);
