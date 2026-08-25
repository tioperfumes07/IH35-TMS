#!/usr/bin/env node
import { readFileSync } from "node:fs";

const files = {
  job: readFileSync("apps/backend/src/compliance/compliance-reminder.job.ts", "utf8"),
  handler: readFileSync("apps/backend/src/outbox/handlers/compliance-reminder-email.handler.ts", "utf8"),
  registry: readFileSync("apps/backend/src/outbox/handlers/registry.ts", "utf8"),
};

function violations(source) {
  const failures = [];
  const required = [
    ["job", '"compliance.reminder_email"', "typed email enqueue"],
    ["job", "compliance-reminder-email:${rule.id}:${cred.owner_type}:${cred.owner_id}", "credential/recipient dedupe"],
    ["job", 'if ((rule.channel ?? []).includes("in_app"))', "independent in-app channel"],
    ["job", '"in_app",\n                userId,\n                "sent"', "user-id in-app log"],
    ["handler", 'eventType = "compliance.reminder_email"', "typed handler"],
    ["handler", "requiresDelivery = true", "required delivery"],
    ["handler", "await sendEmail({", "awaited provider"],
    ["handler", "INSERT INTO compliance.notification_log", "post-success delivery log"],
    ["registry", "new ComplianceReminderEmailHandler()", "registered handler"],
  ];
  for (const [file, needle, label] of required) if (!source[file].includes(needle)) failures.push(`missing ${label}`);
  if (source.job.includes("await sendEmail(")) failures.push("provider I/O remains in cron transaction");
  if (/for \(const recipient[\s\S]{0,1800}channel === "in_app"/.test(source.job)) failures.push("in-app recipients remain nested under email recipients");
  return failures;
}

const mutations = [
  ["job", '"compliance.reminder_email"'],
  ["job", "compliance-reminder-email:${rule.id}:${cred.owner_type}:${cred.owner_id}"],
  ["job", 'if ((rule.channel ?? []).includes("in_app"))'],
  ["job", '"in_app",\n                userId,\n                "sent"'],
  ["handler", 'eventType = "compliance.reminder_email"'],
  ["handler", "requiresDelivery = true"],
  ["handler", "await sendEmail({"],
  ["handler", "INSERT INTO compliance.notification_log"],
  ["registry", "new ComplianceReminderEmailHandler()"],
];

if (process.argv.includes("--selftest")) {
  if (violations(files).length) process.exit(1);
  let caught = 0;
  for (const [file, needle] of mutations) {
    const mutated = { ...files, [file]: files[file].replace(needle, "") };
    if (mutated[file] === files[file]) process.exit(1);
    if (violations(mutated).length) caught += 1;
  }
  if (caught !== mutations.length) process.exit(1);
  console.log(`verify:compliance-reminder-delivery-durability SELFTEST PASS (${caught}/${mutations.length})`);
  process.exit(0);
}

const failures = violations(files);
if (failures.length) {
  console.error(`verify:compliance-reminder-delivery-durability FAIL: ${failures.join("; ")}`);
  process.exit(1);
}
console.log("verify:compliance-reminder-delivery-durability PASS");
