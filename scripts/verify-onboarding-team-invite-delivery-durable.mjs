#!/usr/bin/env node
import fs from "node:fs";

const paths = {
  route: "apps/backend/src/onboarding/state.routes.ts",
  handler: "apps/backend/src/outbox/handlers/onboarding-team-invite.handler.ts",
  registry: "apps/backend/src/outbox/handlers/registry.ts",
};
const production = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, fs.readFileSync(path, "utf8")]));

function failuresFor(s) {
  const failures = [];
  if (!/enqueueOutboxEvent\(\s*client,\s*["']onboarding\.team_invite\.send["']/.test(s.route)) failures.push("team invite is not enqueued in onboarding transaction");
  if (/sendEmail\([\s\S]{0,600}invites_failed \+= 1/.test(s.route)) failures.push("external send still runs inside transaction and converts failure to success response");
  if (!s.route.includes("operating_company_id: body.operating_company_id")) failures.push("event lacks exact company scope");
  if (!s.handler.includes('eventType = "onboarding.team_invite.send"')) failures.push("handler event missing");
  if (!s.handler.includes("requiresDelivery = true")) failures.push("handler may falsely acknowledge unavailable delivery");
  if (!s.handler.includes("enqueueEmailWithClient(ctx.client")) failures.push("handler does not persist canonical email queue on processor transaction");
  if (!s.registry.includes("new OnboardingTeamInviteHandler()")) failures.push("handler is not registered");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["enqueue", { ...production, route: production.route.replace('"onboarding.team_invite.send"', '"onboarding.team_invite.REMOVED"') }],
    ["scope", { ...production, route: production.route.replace("operating_company_id: body.operating_company_id", "operating_company_id: undefined") }],
    ["required", { ...production, handler: production.handler.replace("requiresDelivery = true", "requiresDelivery = false") }],
    ["queue", { ...production, handler: production.handler.replace("enqueueEmailWithClient(ctx.client", "enqueueEmailWithClient(undefined") }],
    ["registry", { ...production, registry: production.registry.replace("new OnboardingTeamInviteHandler()", "") }],
  ];
  const missed = mutations.filter(([, fixture]) => failuresFor(fixture).length === 0);
  if (missed.length) {
    console.error(`verify-onboarding-team-invite-delivery-durable SELFTEST FAIL — ${missed.map(([name]) => name).join(", ")}`);
    process.exit(1);
  }
  console.log(`verify-onboarding-team-invite-delivery-durable selftest PASS — ${mutations.length}/${mutations.length} defects rejected`);
  process.exit(0);
}

const failures = failuresFor(production);
if (failures.length) {
  console.error(`verify-onboarding-team-invite-delivery-durable FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("verify-onboarding-team-invite-delivery-durable PASS — state update and retryable scoped invites commit atomically");
