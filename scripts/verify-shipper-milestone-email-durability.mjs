#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(".");
const servicePath = path.join(ROOT, "apps/backend/src/shipper-portal/load-milestone.service.ts");
const handlerPath = path.join(ROOT, "apps/backend/src/outbox/handlers/shipper-portal-milestone-email.handler.ts");
const registryPath = path.join(ROOT, "apps/backend/src/outbox/handlers/registry.ts");
const original = {
  service: fs.readFileSync(servicePath, "utf8"),
  handler: fs.readFileSync(handlerPath, "utf8"),
  registry: fs.readFileSync(registryPath, "utf8"),
};

function violations(source) {
  const failures = [];
  const required = [
    ["service", `enqueueOutboxEvent(\n        client,\n        "shipper_portal.milestone_email"`, "canonical milestone event enqueue"],
    ["service", "shipper-portal-milestone-email:${milestone.id}:${user.id}", "per-recipient milestone dedupe key"],
    ["service", "if (eligibleRecipientCount > 0)", "notified stamp recipient gate"],
    ["service", "WHERE customer_id = $1::uuid\n        AND operating_company_id = $2::uuid", "portal-user company scope"],
    ["service", "WHERE load_id = $1::uuid\n        AND operating_company_id = $2::uuid\n        AND email_notified_at IS NULL", "pending milestone company scope"],
    ["service", "WHERE id = $1::uuid\n           AND operating_company_id = $2::uuid\n           AND email_notified_at IS NULL", "idempotent company-scoped notified stamp"],
    ["handler", 'eventType = "shipper_portal.milestone_email"', "typed handler"],
    ["handler", "requiresDelivery = true", "required delivery semantics"],
    ["handler", "await sendEmail({", "awaited provider delivery"],
    ["registry", "new ShipperPortalMilestoneEmailHandler()", "registered handler"],
  ];
  for (const [file, needle, label] of required) {
    if (!source[file].includes(needle)) failures.push(`missing ${label}`);
  }
  if (source.service.includes("await sendEmail(")) failures.push("provider I/O remains in milestone transaction");
  if (/catch\s*\{[\s\S]{0,120}continue;/.test(source.service)) failures.push("recipient failure is still swallowed");
  return failures;
}

const mutations = [
  ["drop enqueue", "service", `enqueueOutboxEvent(\n        client,\n        "shipper_portal.milestone_email"`],
  ["drop dedupe", "service", "shipper-portal-milestone-email:${milestone.id}:${user.id}"],
  ["drop stamp gate", "service", "if (eligibleRecipientCount > 0)"],
  ["drop user scope", "service", "WHERE customer_id = $1::uuid\n        AND operating_company_id = $2::uuid"],
  ["drop pending scope", "service", "WHERE load_id = $1::uuid\n        AND operating_company_id = $2::uuid\n        AND email_notified_at IS NULL"],
  ["drop stamp scope", "service", "WHERE id = $1::uuid\n           AND operating_company_id = $2::uuid\n           AND email_notified_at IS NULL"],
  ["drop event type", "handler", 'eventType = "shipper_portal.milestone_email"'],
  ["drop required delivery", "handler", "requiresDelivery = true"],
  ["drop await", "handler", "await sendEmail({"],
  ["drop registration", "registry", "new ShipperPortalMilestoneEmailHandler()"],
];

if (process.argv.includes("--selftest")) {
  const baseline = violations(original);
  if (baseline.length) {
    console.error(`verify:shipper-milestone-email-durability SELFTEST baseline FAIL: ${baseline.join("; ")}`);
    process.exit(1);
  }
  let caught = 0;
  for (const [name, file, needle] of mutations) {
    const mutated = { ...original, [file]: original[file].replace(needle, "") };
    if (mutated[file] === original[file]) {
      console.error(`verify:shipper-milestone-email-durability SELFTEST invalid mutation: ${name}`);
      process.exit(1);
    }
    if (violations(mutated).length) caught += 1;
  }
  if (caught !== mutations.length) {
    console.error(`verify:shipper-milestone-email-durability SELFTEST FAIL: ${caught}/${mutations.length}`);
    process.exit(1);
  }
  console.log(`verify:shipper-milestone-email-durability SELFTEST PASS (${caught}/${mutations.length})`);
  process.exit(0);
}

const failures = violations(original);
if (failures.length) {
  console.error(`verify:shipper-milestone-email-durability FAIL: ${failures.join("; ")}`);
  process.exit(1);
}
console.log("verify:shipper-milestone-email-durability PASS");
