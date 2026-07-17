#!/usr/bin/env node
/**
 * verify-safety-event-severe-notifications.mjs — 0278-safety-gap3-auto-notifications guard
 *
 * POST /api/v1/safety/events-log must fan out in-app + email notifications when severity is
 * high or critical (WF-064 stakeholder alert path). Low/medium events stay silent.
 *
 * Self-test: node scripts/verify-safety-event-severe-notifications.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-event-severe-notifications";

const FILES = {
  routes: "apps/backend/src/safety/events/safety-events.routes.ts",
  notification: "apps/backend/src/safety/events/notification.service.ts",
  workflow: ".github/workflows/locked-guards.yml",
  pkg: "package.json",
};

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

export function assertGuard(sources) {
  const errors = [];
  const routes = stripComments(sources.routes);
  const notification = stripComments(sources.notification);
  const workflow = sources.workflow;
  const pkg = sources.pkg;

  if (!fs.existsSync(path.join(ROOT, FILES.notification))) {
    errors.push(`${FILES.notification}: missing severe safety-event notification service`);
    return errors;
  }

  if (!/export\s+async\s+function\s+notifySevereSafetyEvent/.test(notification)) {
    errors.push(`${FILES.notification}: must export notifySevereSafetyEvent()`);
  }
  if (!/export\s+function\s+isSevereSafetyEventSeverity/.test(notification)) {
    errors.push(`${FILES.notification}: must export isSevereSafetyEventSeverity()`);
  }
  if (!/listCompanyNotifyUserIds/.test(notification)) {
    errors.push(`${FILES.notification}: must resolve stakeholder recipients via listCompanyNotifyUserIds`);
  }
  if (!/createNotification/.test(notification)) {
    errors.push(`${FILES.notification}: must create in-app notifications via createNotification`);
  }
  if (!/sendEmail/.test(notification)) {
    errors.push(`${FILES.notification}: must attempt email dispatch via sendEmail (non-blocking)`);
  }
  if (!/0278-safety-gap3-auto-notifications/.test(notification)) {
    errors.push(`${FILES.notification}: source_block must tag 0278-safety-gap3-auto-notifications`);
  }

  if (!/from\s+"\.\/notification\.service\.js"/.test(routes)) {
    errors.push(`${FILES.routes}: must import ./notification.service.js`);
  }
  if (!/await\s+notifySevereSafetyEvent\s*\(/.test(routes)) {
    errors.push(`${FILES.routes}: POST handler must call notifySevereSafetyEvent on severe events`);
  }
  if (!/isSevereSafetyEventSeverity/.test(routes)) {
    errors.push(`${FILES.routes}: POST handler must gate on isSevereSafetyEventSeverity()`);
  }

  if (!/"verify:safety-event-severe-notifications"/.test(pkg)) {
    errors.push(`${FILES.pkg}: must register verify:safety-event-severe-notifications npm script`);
  }
  if (!/verify-safety-event-severe-notifications\.mjs/.test(workflow)) {
    errors.push(`${FILES.workflow}: must invoke verify:safety-event-severe-notifications in CI`);
  }

  return errors;
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function selftest() {
  const good = {
    routes: `
      import { isSevereSafetyEventSeverity, notifySevereSafetyEvent } from "./notification.service.js";
      if (createdEvent && isSevereSafetyEventSeverity(body.data.severity)) {
        await notifySevereSafetyEvent(client, { event_id: createdId });
      }
    `,
    notification: `
      export function isSevereSafetyEventSeverity(severity) { return severity === "high" || severity === "critical"; }
      export async function notifySevereSafetyEvent(client, input) {
        await listCompanyNotifyUserIds(client, input.operating_company_id, ["Owner"]);
        await createNotification({ source_block: "0278-safety-gap3-auto-notifications" }, client);
        await sendEmail({});
      }
    `,
    workflow: 'run: npm run verify:safety-event-severe-notifications\nverify-safety-event-severe-notifications.mjs',
    pkg: '"verify:safety-event-severe-notifications": "node scripts/verify-safety-event-severe-notifications.mjs"',
  };

  if (assertGuard(good).length) {
    console.error(`[${LABEL}] --selftest FAIL: good fixture rejected`, assertGuard(good));
    process.exit(1);
  }

  const bad = {
    ...good,
    routes: good.routes.replace("await notifySevereSafetyEvent(client", "await /* removed */(client"),
  };
  if (!assertGuard(bad).some((e) => e.includes("notifySevereSafetyEvent"))) {
    console.error(`[${LABEL}] --selftest FAIL: bad fixture not rejected`, assertGuard(bad));
    process.exit(1);
  }

  console.log(`[${LABEL}] --selftest OK`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

for (const rel of [FILES.routes, FILES.notification, FILES.workflow, FILES.pkg]) {
  if (!fs.existsSync(path.join(ROOT, rel))) {
    console.error(`[${LABEL}] FAILED — missing ${rel}`);
    process.exit(1);
  }
}

const errs = assertGuard({
  routes: read(FILES.routes),
  notification: read(FILES.notification),
  workflow: read(FILES.workflow),
  pkg: read(FILES.pkg),
});

if (errs.length) {
  console.error(`[${LABEL}] FAILED — ${errs.length} issue(s):`);
  for (const e of errs) console.error(`  ✗ ${e}`);
  process.exit(1);
}

console.log(
  `[${LABEL}] OK — severe safety-event create fans out stakeholder notifications (high/critical only).`
);
