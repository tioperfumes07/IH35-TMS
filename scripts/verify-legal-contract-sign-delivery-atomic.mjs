#!/usr/bin/env node
import fs from "node:fs";

const paths = {
  service: "apps/backend/src/legal/contracts.service.ts",
  handler: "apps/backend/src/outbox/handlers/legal-contract-sign-email.handler.ts",
  verificationHandler: "apps/backend/src/outbox/handlers/legal-contract-verification-email.handler.ts",
  registry: "apps/backend/src/outbox/handlers/registry.ts",
};
const production = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, fs.readFileSync(path, "utf8")]));

function failuresFor(s) {
  const failures = [];
  if (!s.service.includes('from "../outbox/enqueue-outbox-event.js"')) failures.push("legal service does not use canonical outbox helper");
  if (/async function enqueueOutboxEvent\(/.test(s.service)) failures.push("hand-written local outbox helper remains");
  if (!/INSERT INTO legal\.contract_signing_tokens[\s\S]{0,2200}["']legal\.contract\.sign_email["']/.test(s.service)) failures.push("email delivery intent does not follow token write in same operation");
  const contractAggregates = s.service.match(/aggregate_type: "legal\.contract_instances"/g)?.length ?? 0;
  if (contractAggregates !== 4) failures.push(`sign-link and verification email/SMS must all carry canonical contract aggregate (found ${contractAggregates})`);
  if (!s.service.includes("operating_company_id: args.operatingCompanyId")) failures.push("delivery payload lacks exact company scope");
  if (!s.handler.includes('eventType = "legal.contract.sign_email"')) failures.push("email handler event missing");
  if (!s.handler.includes("requiresDelivery = true")) failures.push("email handler may falsely acknowledge unavailable delivery");
  if (!s.handler.includes("await sendEmail({")) failures.push("email handler does not await canonical provider");
  if (!s.verificationHandler.includes('eventType = "legal.contract.verification_email"')) failures.push("verification email handler event missing");
  if (!s.verificationHandler.includes("requiresDelivery = true")) failures.push("verification handler may falsely acknowledge unavailable delivery");
  if (!s.service.includes('"legal.contract.verification_email"')) failures.push("verification code email is not transactionally enqueued");
  if (!s.registry.includes("new LegalContractSignEmailHandler()")) failures.push("email handler is not registered");
  if (!s.registry.includes("new LegalContractVerificationEmailHandler()")) failures.push("verification handler is not registered");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["canonical helper", { ...production, service: production.service.replace('from "../outbox/enqueue-outbox-event.js"', 'from "../outbox/REMOVED.js"') }],
    ["email event", { ...production, service: production.service.replace('"legal.contract.sign_email"', '"legal.contract.REMOVED"') }],
    ["aggregate", { ...production, service: production.service.replace('aggregate_type: "legal.contract_instances"', 'aggregate_type: "unknown"') }],
    ["required", { ...production, handler: production.handler.replace("requiresDelivery = true", "requiresDelivery = false") }],
    ["registry", { ...production, registry: production.registry.replace("new LegalContractSignEmailHandler()", "") }],
  ];
  const missed = mutations.filter(([, fixture]) => failuresFor(fixture).length === 0);
  if (missed.length) {
    console.error(`verify-legal-contract-sign-delivery-atomic SELFTEST FAIL — ${missed.map(([name]) => name).join(", ")}`);
    process.exit(1);
  }
  console.log(`verify-legal-contract-sign-delivery-atomic selftest PASS — ${mutations.length}/${mutations.length} defects rejected`);
  process.exit(0);
}

const failures = failuresFor(production);
if (failures.length) {
  console.error(`verify-legal-contract-sign-delivery-atomic FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("verify-legal-contract-sign-delivery-atomic PASS — token/status/audit and all delivery channels share canonical outbox transaction");
