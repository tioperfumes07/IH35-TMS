#!/usr/bin/env node
import fs from "node:fs";

const FILES = {
  route: "apps/backend/src/auth/email-routes.ts",
  handler: "apps/backend/src/outbox/handlers/auth-email-verification.handler.ts",
  registry: "apps/backend/src/outbox/handlers/registry.ts",
};

export function problems(s) {
  const failures = [];
  if (!/"auth\.email\.verification_started"[\s\S]{0,300}?email,[\s\S]{0,100}?code,[\s\S]{0,100}?actor_user_id/.test(s.route)) {
    failures.push("verification event must durably carry email, code and actor");
  }
  if (/void\s+sendEmailCode\([\s\S]{0,200}?\.catch\(\(\)\s*=>\s*undefined\)/.test(s.route)) {
    failures.push("auth start must not swallow a detached provider send");
  }
  if (!s.handler.includes('eventType = "auth.email.verification_started"')) failures.push("verification delivery handler missing");
  if (!s.handler.includes("requiresDelivery = true")) failures.push("verification email cannot be marked delivered when unavailable");
  if (!s.handler.includes("await sendEmailCode(email, code, actorUserId)")) failures.push("handler must await the canonical email provider");
  if (!s.registry.includes("new AuthEmailVerificationHandler()")) failures.push("verification handler not registered");
  return failures;
}

const production = Object.fromEntries(Object.entries(FILES).map(([key, rel]) => [key, fs.readFileSync(rel, "utf8")]));
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["code payload", { ...production, route: production.route.replace("            code,", "            otp_removed,") }],
    ["swallowed send", { ...production, route: `${production.route}\nvoid sendEmailCode(email, code, user.id).catch(() => undefined);` }],
    ["required delivery", { ...production, handler: production.handler.replace("requiresDelivery = true", "requiresDelivery = false") }],
    ["await provider", { ...production, handler: production.handler.replace("await sendEmailCode(email, code, actorUserId)", "void sendEmailCode(email, code, actorUserId)") }],
    ["registry", { ...production, registry: production.registry.replace("new AuthEmailVerificationHandler()", "/* removed */") }],
  ];
  const missed = mutations.filter(([, fixture]) => problems(fixture).length === 0);
  if (missed.length) {
    console.error(`verify-auth-email-verification-delivery-durable SELFTEST FAIL — ${missed.map(([name]) => name).join(", ")}`);
    process.exit(1);
  }
  console.log(`verify-auth-email-verification-delivery-durable selftest PASS — ${mutations.length}/${mutations.length} defects rejected`);
  process.exit(0);
}
const failures = problems(production);
if (failures.length) {
  console.error(`verify-auth-email-verification-delivery-durable FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("verify-auth-email-verification-delivery-durable PASS — code issuance and retryable delivery share one durable event");
