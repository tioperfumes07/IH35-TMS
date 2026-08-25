#!/usr/bin/env node
import fs from "node:fs";

const files = {
  route: fs.readFileSync("apps/backend/src/shipper-portal/portal-auth.routes.ts", "utf8"),
  handler: fs.readFileSync("apps/backend/src/outbox/handlers/shipper-portal-password-reset-email.handler.ts", "utf8"),
  registry: fs.readFileSync("apps/backend/src/outbox/handlers/registry.ts", "utf8"),
};

function failures(source) {
  const out = [];
  const required = [
    ["route", `enqueueOutboxEvent(\n          client,\n          "shipper_portal.password_reset_email"`],
    ["route", "shipper-portal-password-reset:${token}"],
    ["route", "operating_company_id: user.operating_company_id"],
    ["handler", 'eventType = "shipper_portal.password_reset_email"'],
    ["handler", "requiresDelivery = true"],
    ["handler", "await sendEmail({"],
    ["registry", "new ShipperPortalPasswordResetEmailHandler()"],
  ];
  for (const [file, needle] of required) if (!source[file].includes(needle)) out.push(`missing ${needle}`);
  if (source.route.includes("await sendEmail(")) out.push("provider I/O remains in forgot-password route");
  if (/catch\s*\{\s*\/\/ generic response/.test(source.route)) out.push("delivery failure is still swallowed");
  return out;
}

const mutations = [
  ["route", `enqueueOutboxEvent(\n          client,\n          "shipper_portal.password_reset_email"`],
  ["route", "shipper-portal-password-reset:${token}"],
  ["route", "operating_company_id: user.operating_company_id"],
  ["handler", 'eventType = "shipper_portal.password_reset_email"'],
  ["handler", "requiresDelivery = true"],
  ["handler", "await sendEmail({"],
  ["registry", "new ShipperPortalPasswordResetEmailHandler()"],
];

if (process.argv.includes("--selftest")) {
  if (failures(files).length) process.exit(1);
  let caught = 0;
  for (const [file, needle] of mutations) {
    const mutated = { ...files, [file]: files[file].replace(needle, "") };
    if (mutated[file] === files[file]) process.exit(1);
    if (failures(mutated).length) caught += 1;
  }
  if (caught !== mutations.length) process.exit(1);
  console.log(`verify:shipper-portal-password-reset-durability SELFTEST PASS (${caught}/${mutations.length})`);
  process.exit(0);
}

const found = failures(files);
if (found.length) {
  console.error(`verify:shipper-portal-password-reset-durability FAIL: ${found.join("; ")}`);
  process.exit(1);
}
console.log("verify:shipper-portal-password-reset-durability PASS");
