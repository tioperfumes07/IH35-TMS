#!/usr/bin/env node
import fs from "node:fs";

const paths = {
  service: "apps/backend/src/legal/attorney-review.service.ts",
  handler: "apps/backend/src/outbox/handlers/legal-attorney-decision-email.handler.ts",
  registry: "apps/backend/src/outbox/handlers/registry.ts",
};
const production = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, fs.readFileSync(path, "utf8")]));

function failuresFor(s) {
  const failures = [];
  const enqueues = s.service.match(/enqueueOfficeAttorneyDecision\(client,/g)?.length ?? 0;
  if (enqueues !== 3) failures.push(`approve/changes/reject must each enqueue inside transaction (found ${enqueues})`);
  if (/if \(!updated(?:Row)?\)[\s\S]{0,900}notifyOfficeAttorneyDecision/.test(s.service)) failures.push("postcommit provider call still controls response after token consumption");
  if (!s.service.includes('"legal.attorney.decision_email"')) failures.push("typed attorney decision event missing");
  if (!s.service.includes("operating_company_id: operatingCompanyId")) failures.push("decision event lacks exact company scope");
  if (!s.handler.includes('eventType = "legal.attorney.decision_email"')) failures.push("handler event missing");
  if (!s.handler.includes("requiresDelivery = true")) failures.push("handler may falsely acknowledge unavailable delivery");
  if (!s.handler.includes("await sendEmail({")) failures.push("handler does not await canonical provider");
  if (!s.registry.includes("new LegalAttorneyDecisionEmailHandler()")) failures.push("handler is not registered");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const first = production.service.indexOf("enqueueOfficeAttorneyDecision(client,");
  const mutations = [
    ["all decisions", { ...production, service: production.service.slice(0, first) + production.service.slice(first).replace("enqueueOfficeAttorneyDecision(client,", "Promise.resolve(") }],
    ["typed event", { ...production, service: production.service.replace('"legal.attorney.decision_email"', '"legal.attorney.REMOVED"') }],
    ["scope", { ...production, service: production.service.replace("operating_company_id: operatingCompanyId", "operating_company_id: undefined") }],
    ["required", { ...production, handler: production.handler.replace("requiresDelivery = true", "requiresDelivery = false") }],
    ["registry", { ...production, registry: production.registry.replace("new LegalAttorneyDecisionEmailHandler()", "") }],
  ];
  const missed = mutations.filter(([, fixture]) => failuresFor(fixture).length === 0);
  if (missed.length) {
    console.error(`verify-legal-attorney-decision-delivery-durable SELFTEST FAIL — ${missed.map(([name]) => name).join(", ")}`);
    process.exit(1);
  }
  console.log(`verify-legal-attorney-decision-delivery-durable selftest PASS — ${mutations.length}/${mutations.length} defects rejected`);
  process.exit(0);
}

const failures = failuresFor(production);
if (failures.length) {
  console.error(`verify-legal-attorney-decision-delivery-durable FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("verify-legal-attorney-decision-delivery-durable PASS — all three legal decisions commit with scoped retryable delivery");
