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
  dispatcher: "apps/backend/src/notifications/dispatcher.ts",
  handler: "apps/backend/src/outbox/handlers/safety-event-severe-notification.handler.ts",
  registry: "apps/backend/src/outbox/handlers/registry.ts",
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
  const dispatcher = stripComments(sources.dispatcher);
  const handler = stripComments(sources.handler);
  const registry = stripComments(sources.registry);
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
  if (!/enqueueOutboxEvent\(/.test(notification) || !/"safety\.event\.severe_notification"/.test(notification)) {
    errors.push(`${FILES.notification}: severe notification intent must use the canonical outbox inside the event transaction`);
  }
  if (/sendEmail\(/.test(notification) || /createNotification\(/.test(notification)) {
    errors.push(`${FILES.notification}: must not perform provider or in-app delivery before event commit`);
  }
  if (!/safety-event-severe:\$\{input\.event_id\}/.test(notification)) {
    errors.push(`${FILES.notification}: severe event intent requires event-id dedupe`);
  }
  if (!/0278-safety-gap3-auto-notifications/.test(notification)) {
    if (!/0278-safety-gap3-auto-notifications/.test(handler)) errors.push(`${FILES.handler}: source_block must tag 0278-safety-gap3-auto-notifications`);
  }
  if (!/requiresDelivery\s*=\s*true/.test(handler) || !/await sendEmail\(/.test(handler) || !/await createNotification\(/.test(handler)) {
    errors.push(`${FILES.handler}: must require and await both notification channels`);
  }
  if (!/new SafetyEventSevereNotificationHandler\(\)/.test(registry)) errors.push(`${FILES.registry}: handler must be registered`);
  if (!/SELECT DISTINCT u\.id[\s\S]{0,160}uca\.user_id = u\.id/.test(dispatcher) || /\bu\.uuid\b/.test(dispatcher)) {
    errors.push(`${FILES.dispatcher}: company role recipients must resolve canonical identity.users.id`);
  }
  if (/listCompanyUserIdsByRoles[\s\S]{0,1200}?catch\s*\([^)]*\)\s*\{[\s\S]{0,240}?return\s+\[\]/.test(dispatcher)) {
    errors.push(`${FILES.dispatcher}: recipient census failures must propagate instead of reporting zero recipients`);
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
        await enqueueOutboxEvent(client, "safety.event.severe_notification", {}, {}, \`safety-event-severe:\${input.event_id}\`);
      }
    `,
    handler: `class SafetyEventSevereNotificationHandler { requiresDelivery = true; async deliver() { await createNotification({ source_block: "0278-safety-gap3-auto-notifications" }); await sendEmail({}); } }`,
    registry: `new SafetyEventSevereNotificationHandler(),`,
    dispatcher: `
      export async function listCompanyUserIdsByRoles() {
        return withLuciaBypass(async () => {
          return client.query("SELECT DISTINCT u.id FROM identity.users u JOIN org.user_company_access uca ON uca.user_id = u.id");
        });
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
    dispatcher: good.dispatcher.replaceAll("u.id", "u.uuid"),
  };
  if (!assertGuard(bad).some((e) => e.includes("identity.users.id"))) {
    console.error(`[${LABEL}] --selftest FAIL: bad fixture not rejected`, assertGuard(bad));
    process.exit(1);
  }

  const swallowed = {
    ...good,
    dispatcher: `
      export async function listCompanyUserIdsByRoles() {
        try {
          return await withLuciaBypass(async () => client.query("SELECT DISTINCT u.id FROM identity.users u JOIN org.user_company_access uca ON uca.user_id = u.id"));
        } catch (error) {
          return [];
        }
      }
    `,
  };
  if (!assertGuard(swallowed).some((e) => e.includes("must propagate"))) {
    console.error(`[${LABEL}] --selftest FAIL: swallowed census not rejected`, assertGuard(swallowed));
    process.exit(1);
  }

  const outboxBypass = { ...good, notification: good.notification.replace("enqueueOutboxEvent(", "sendEmail(") };
  if (!assertGuard(outboxBypass).some((e) => e.includes("canonical outbox"))) {
    console.error(`[${LABEL}] --selftest FAIL: outbox bypass not rejected`, assertGuard(outboxBypass));
    process.exit(1);
  }
  const optionalDelivery = { ...good, handler: good.handler.replace("requiresDelivery = true", "requiresDelivery = false") };
  if (!assertGuard(optionalDelivery).some((e) => e.includes("must require"))) {
    console.error(`[${LABEL}] --selftest FAIL: optional delivery not rejected`, assertGuard(optionalDelivery));
    process.exit(1);
  }
  const unregistered = { ...good, registry: "" };
  if (!assertGuard(unregistered).some((e) => e.includes("must be registered"))) {
    console.error(`[${LABEL}] --selftest FAIL: unregistered handler not rejected`, assertGuard(unregistered));
    process.exit(1);
  }

  console.log(`[${LABEL}] --selftest OK — 5/5 planted defects rejected`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

for (const rel of [FILES.routes, FILES.notification, FILES.dispatcher, FILES.handler, FILES.registry, FILES.workflow, FILES.pkg]) {
  if (!fs.existsSync(path.join(ROOT, rel))) {
    console.error(`[${LABEL}] FAILED — missing ${rel}`);
    process.exit(1);
  }
}

const errs = assertGuard({
  routes: read(FILES.routes),
  notification: read(FILES.notification),
  dispatcher: read(FILES.dispatcher),
  handler: read(FILES.handler),
  registry: read(FILES.registry),
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
