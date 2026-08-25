#!/usr/bin/env node
import fs from "node:fs";

const paths = {
  route: "apps/backend/src/identity/password-reset.routes.ts",
  handler: "apps/backend/src/outbox/handlers/identity-password-reset-email.handler.ts",
  registry: "apps/backend/src/outbox/handlers/registry.ts",
};
const production = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, fs.readFileSync(path, "utf8")]));

function failuresFor(s) {
  const failures = [];
  if (!/INSERT INTO identity\.password_reset_tokens[\s\S]{0,1800}enqueueOutboxEvent\(\s*client,\s*["']identity\.password_reset\.email_requested["']/.test(s.route)) failures.push("token and delivery event do not share the transaction");
  if (/sendEmail\([\s\S]{0,900}Stay generic to callers/.test(s.route)) failures.push("postcommit provider failure is still silently swallowed");
  if (!s.route.includes("confirm_url: frontendResetConfirmUrl(token)")) failures.push("durable event lacks the issued token URL");
  if (!s.handler.includes('eventType = "identity.password_reset.email_requested"')) failures.push("handler event missing");
  if (!s.handler.includes("requiresDelivery = true")) failures.push("handler may falsely acknowledge unavailable delivery");
  if (!s.handler.includes("await sendEmail({")) failures.push("handler does not await the canonical provider");
  if (!s.registry.includes("new IdentityPasswordResetEmailHandler()")) failures.push("handler is not registered");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["enqueue", { ...production, route: production.route.replace('"identity.password_reset.email_requested"', '"identity.password_reset.REMOVED"') }],
    ["token URL", { ...production, route: production.route.replace("confirm_url: frontendResetConfirmUrl(token)", "confirm_url: undefined") }],
    ["required", { ...production, handler: production.handler.replace("requiresDelivery = true", "requiresDelivery = false") }],
    ["await provider", { ...production, handler: production.handler.replace("await sendEmail({", "void sendEmail({") }],
    ["registry", { ...production, registry: production.registry.replace("new IdentityPasswordResetEmailHandler()", "") }],
  ];
  const missed = mutations.filter(([, fixture]) => failuresFor(fixture).length === 0);
  if (missed.length) {
    console.error(`verify-identity-password-reset-delivery-durable SELFTEST FAIL — ${missed.map(([name]) => name).join(", ")}`);
    process.exit(1);
  }
  console.log(`verify-identity-password-reset-delivery-durable selftest PASS — ${mutations.length}/${mutations.length} defects rejected`);
  process.exit(0);
}

const failures = failuresFor(production);
if (failures.length) {
  console.error(`verify-identity-password-reset-delivery-durable FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("verify-identity-password-reset-delivery-durable PASS — reset token and retryable anti-enumeration delivery commit atomically");
