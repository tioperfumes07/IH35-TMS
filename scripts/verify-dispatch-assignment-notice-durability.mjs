#!/usr/bin/env node
import { readFileSync } from "node:fs";

const FILES = {
  quick: "apps/backend/src/dispatch/quick-assign.service.ts",
  reassign: "apps/backend/src/dispatch/dispatch-refinements.service.ts",
  routes: "apps/backend/src/outbox/handlers/operational-notice.routes.ts",
};

function count(source, literal) {
  return source.split(literal).length - 1;
}

export function problems(files) {
  const failures = [];
  const quick = files.quick ?? "";
  const reassign = files.reassign ?? "";
  const routes = files.routes ?? "";

  if (!quick.includes('enqueueOutboxEvent(\n          client,\n          "load.assigned_to_driver"')) {
    failures.push("Quick Assign must enqueue load.assigned_to_driver on its scoped transaction client");
  }
  if (quick.indexOf('"load.assigned_to_driver"') > quick.indexOf("notifyBox.v =")) {
    failures.push("Quick Assign durable enqueue must precede its supplemental push handoff");
  }
  if (!reassign.includes('"load.reassigned_away_from_driver"')) {
    failures.push("manual reassignment must durably notify the previous driver");
  }
  if (!reassign.includes('"load.assigned_to_driver"')) {
    failures.push("manual reassignment must durably notify the replacement driver");
  }
  const commit = reassign.indexOf('client.query("COMMIT")');
  for (const eventType of ["load.reassigned_away_from_driver", "load.assigned_to_driver"]) {
    const event = reassign.indexOf(`"${eventType}"`);
    if (event < 0 || commit < 0 || event > commit) failures.push(`${eventType} must be enqueued before COMMIT`);
  }
  for (const eventType of ["load.assigned_to_driver", "load.reassigned_away_from_driver"]) {
    if (!routes.includes(`eventType: "${eventType}"`)) failures.push(`${eventType} needs a registered handler route`);
  }
  if (count(routes, 'audience: { kind: "driver", driverIdKey: "driver_id"') < 2) {
    failures.push("both assignment lifecycle notices must target the canonical driver audience");
  }
  return failures;
}

const production = Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, readFileSync(file, "utf8")]));

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["quick durable enqueue", { ...production, quick: production.quick.replace('"load.assigned_to_driver"', '"load.assigned_REMOVED"') }],
    ["previous-driver enqueue", { ...production, reassign: production.reassign.replace('"load.reassigned_away_from_driver"', '"load.reassigned_away_REMOVED"') }],
    ["assigned handler", { ...production, routes: production.routes.replace('eventType: "load.assigned_to_driver"', 'eventType: "load.assigned_REMOVED"') }],
    ["reassigned-away handler", { ...production, routes: production.routes.replace('eventType: "load.reassigned_away_from_driver"', 'eventType: "load.reassigned_away_REMOVED"') }],
  ];
  const missed = mutations.filter(([, fixture]) => problems(fixture).length === 0);
  if (missed.length) {
    console.error(`verify-dispatch-assignment-notice-durability SELFTEST FAILED: ${missed.map(([name]) => name).join(", ")}`);
    process.exit(1);
  }
  console.log(`verify-dispatch-assignment-notice-durability selftest PASS — ${mutations.length}/${mutations.length} planted defects rejected`);
  process.exit(0);
}

const failures = problems(production);
if (failures.length) {
  console.error(`verify-dispatch-assignment-notice-durability FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("verify-dispatch-assignment-notice-durability PASS — assignment and reassignment driver notices are transactional, durable, and handled");
