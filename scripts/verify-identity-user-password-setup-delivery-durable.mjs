#!/usr/bin/env node
import fs from "node:fs";

const FILES = {
  route: "apps/backend/src/identity/users.routes.ts",
  handler: "apps/backend/src/outbox/handlers/identity-user-password-setup.handler.ts",
  registry: "apps/backend/src/outbox/handlers/registry.ts",
};

const production = Object.fromEntries(Object.entries(FILES).map(([key, path]) => [key, fs.readFileSync(path, "utf8")]));

function failuresFor(s) {
  const failures = [];
  if (!/enqueueOutboxEvent\(\s*client,\s*["']identity\.user\.password_setup_invite["']/.test(s.route)) failures.push("setup invite is not enqueued in the user-create transaction");
  if (/sendEmail\([\s\S]{0,900}Keep user creation successful even if mail provider/.test(s.route)) failures.push("detached provider send is still silently swallowed");
  if (!s.route.includes("operating_company_id: inheritedCompanyId")) failures.push("invite event lacks exact company scope");
  if (!s.handler.includes('eventType = "identity.user.password_setup_invite"')) failures.push("required-delivery handler missing");
  if (!s.handler.includes("requiresDelivery = true")) failures.push("handler may falsely acknowledge unavailable delivery");
  if (!s.handler.includes("enqueueEmailWithClient(ctx.client")) failures.push("handler does not persist to canonical email queue on processor transaction");
  if (!s.handler.includes("set_config('app.operating_company_id'")) failures.push("handler does not set selected-company RLS context");
  if (!s.registry.includes("new IdentityUserPasswordSetupHandler()")) failures.push("handler is not registered");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["transactional enqueue", { ...production, route: production.route.replace('"identity.user.password_setup_invite"', '"identity.user.REMOVED"') }],
    ["company scope", { ...production, route: production.route.replace("operating_company_id: inheritedCompanyId", "operating_company_id: undefined") }],
    ["required delivery", { ...production, handler: production.handler.replace("requiresDelivery = true", "requiresDelivery = false") }],
    ["canonical queue", { ...production, handler: production.handler.replace("enqueueEmailWithClient(ctx.client", "enqueueEmailWithClient(undefined") }],
    ["registry", { ...production, registry: production.registry.replace("new IdentityUserPasswordSetupHandler()", "") }],
  ];
  const missed = mutations.filter(([, fixture]) => failuresFor(fixture).length === 0);
  if (missed.length) {
    console.error(`verify-identity-user-password-setup-delivery-durable SELFTEST FAIL — ${missed.map(([name]) => name).join(", ")}`);
    process.exit(1);
  }
  console.log(`verify-identity-user-password-setup-delivery-durable selftest PASS — ${mutations.length}/${mutations.length} defects rejected`);
  process.exit(0);
}

const failures = failuresFor(production);
if (failures.length) {
  console.error(`verify-identity-user-password-setup-delivery-durable FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("verify-identity-user-password-setup-delivery-durable PASS — password token and retryable selected-company delivery commit atomically");
