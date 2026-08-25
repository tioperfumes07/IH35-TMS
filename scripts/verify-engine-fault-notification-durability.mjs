#!/usr/bin/env node
import { readFileSync } from "node:fs";

const files = {
  notifications: readFileSync("apps/backend/src/notifications/fault-notifications.ts", "utf8"),
  outboxHandler: readFileSync("apps/backend/src/outbox/handlers/maintenance-engine-fault-notification.handler.ts", "utf8"),
  registry: readFileSync("apps/backend/src/outbox/handlers/registry.ts", "utf8"),
};

function violations(source) {
  const failures = [];
  const required = [
    ["notifications", '"maintenance.engine_fault_work_order_notification"', "canonical notification enqueue"],
    ["notifications", "maintenance-engine-fault-work-order-notification:${input.work_order_id}", "work-order dedupe"],
    ["notifications", "export async function deliverEngineFaultWorkOrderNotification", "provider delivery separation"],
    ["outboxHandler", 'eventType = "maintenance.engine_fault_work_order_notification"', "typed handler"],
    ["outboxHandler", "requiresDelivery = true", "required delivery"],
    ["outboxHandler", "await deliverEngineFaultWorkOrderNotification", "awaited delivery"],
    ["registry", "new MaintenanceEngineFaultNotificationHandler()", "registered handler"],
  ];
  for (const [file, needle, label] of required) if (!source[file].includes(needle)) failures.push(`missing ${label}`);
  if (/sendEmail\([\s\S]{0,500}catch\s*\{/.test(source.notifications)) failures.push("email failure remains swallowed");
  return failures;
}

const mutations = [
  ["notifications", '"maintenance.engine_fault_work_order_notification"'],
  ["notifications", "maintenance-engine-fault-work-order-notification:${input.work_order_id}"],
  ["notifications", "export async function deliverEngineFaultWorkOrderNotification"],
  ["outboxHandler", 'eventType = "maintenance.engine_fault_work_order_notification"'],
  ["outboxHandler", "requiresDelivery = true"],
  ["outboxHandler", "await deliverEngineFaultWorkOrderNotification"],
  ["registry", "new MaintenanceEngineFaultNotificationHandler()"],
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
  console.log(`verify:engine-fault-notification-durability SELFTEST PASS (${caught}/${mutations.length})`);
  process.exit(0);
}

const failures = violations(files);
if (failures.length) {
  console.error(`verify:engine-fault-notification-durability FAIL: ${failures.join("; ")}`);
  process.exit(1);
}
console.log("verify:engine-fault-notification-durability PASS");
