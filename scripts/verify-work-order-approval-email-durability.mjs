#!/usr/bin/env node
import fs from "node:fs";

const FILES = {
  workOrders: "apps/backend/src/work-orders/work-orders.routes.ts",
  handler: "apps/backend/src/outbox/handlers/work-order-approved.handler.ts",
  registry: "apps/backend/src/outbox/handlers/registry.ts",
  queue: "apps/backend/src/email/queue.service.ts",
};

export function problems(s) {
  const failures = [];
  if (!/enqueueWorkOrderOutbox\(client,\s*["']work_order\.approved["'],\s*\{[\s\S]{0,500}?operating_company_id\s*:/.test(s.workOrders)) {
    failures.push("WO approval must enqueue selected-company email context transactionally");
  }
  if (/void\s+enqueueEmail\([\s\S]{0,500}?\.catch\(\(\)\s*=>\s*undefined\)/.test(s.workOrders)) {
    failures.push("WO approval must not swallow post-commit email enqueue failure");
  }
  if (!s.handler.includes('eventType = "work_order.approved"')) failures.push("work_order.approved handler missing");
  if (!s.handler.includes("enqueueEmailWithClient(ctx.client")) failures.push("WO email insert must share processor transaction");
  if (!s.handler.includes("set_config('app.operating_company_id'")) failures.push("WO email handler missing selected-company RLS context");
  if (!s.registry.includes("new WorkOrderApprovedHandler()")) failures.push("WO approval handler not registered");
  if (!s.queue.includes("export async function enqueueEmailWithClient")) failures.push("client-scoped email queue primitive missing");
  return failures;
}

const production = Object.fromEntries(Object.entries(FILES).map(([key, rel]) => [key, fs.readFileSync(rel, "utf8")]));

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["company payload", { ...production, workOrders: production.workOrders.replace('enqueueWorkOrderOutbox(client, "work_order.approved", {\n        operating_company_id', 'enqueueWorkOrderOutbox(client, "work_order.approved", {\n        REMOVED_company_id') }],
    ["swallowed enqueue", { ...production, workOrders: `${production.workOrders}\nvoid enqueueEmail({}).catch(() => undefined);` }],
    ["shared transaction", { ...production, handler: production.handler.replace("enqueueEmailWithClient(ctx.client", "enqueueEmailWithClient(otherClient") }],
    ["RLS context", { ...production, handler: production.handler.replace("app.operating_company_id", "app.REMOVED_company_id") }],
    ["registry", { ...production, registry: production.registry.replace("new WorkOrderApprovedHandler()", "/* removed */") }],
  ];
  const missed = mutations.filter(([, fixture]) => problems(fixture).length === 0);
  if (missed.length) {
    console.error(`verify-work-order-approval-email-durability SELFTEST FAIL — escaped: ${missed.map(([name]) => name).join(", ")}`);
    process.exit(1);
  }
  console.log(`verify-work-order-approval-email-durability selftest PASS — ${mutations.length}/${mutations.length} defects rejected`);
  process.exit(0);
}

const failures = problems(production);
if (failures.length) {
  console.error(`verify-work-order-approval-email-durability FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("verify-work-order-approval-email-durability PASS — approval trail and configured email enqueue are atomic");
