#!/usr/bin/env node
import { readFileSync } from "node:fs";

const FILES = {
  quick: "apps/backend/src/dispatch/quick-assign.service.ts",
  reassign: "apps/backend/src/dispatch/dispatch-refinements.service.ts",
  routes: "apps/backend/src/outbox/handlers/operational-notice.routes.ts",
  loads: "apps/backend/src/dispatch/loads.routes.ts",
  dispatcher: "apps/backend/src/notifications/dispatcher.ts",
};

function count(source, literal) {
  return source.split(literal).length - 1;
}

export function problems(files) {
  const failures = [];
  const quick = files.quick ?? "";
  const reassign = files.reassign ?? "";
  const routes = files.routes ?? "";
  const loads = files.loads ?? "";
  const dispatcher = files.dispatcher ?? "";

  if (!quick.includes('enqueueOutboxEvent(\n          client,\n          "load.assigned_to_driver"')) {
    failures.push("Quick Assign must enqueue load.assigned_to_driver on its scoped transaction client");
  }
  if (/notifyLoadAssigned|notifyBox|\.catch\(\(\) => undefined\)/.test(quick)) {
    failures.push("Quick Assign must use only the durable outbox, never a duplicate swallowed direct push");
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
  if (/notifyLoadAssigned|notifyLoadReassignedAway|loserBox|winnerBox|\.catch\(\(\) => undefined\)/.test(reassign)) {
    failures.push("manual reassignment must use only durable outbox events, never duplicate swallowed direct pushes");
  }
  for (const eventType of ["load.assigned_to_driver", "load.reassigned_away_from_driver"]) {
    if (!routes.includes(`eventType: "${eventType}"`)) failures.push(`${eventType} needs a registered handler route`);
  }
  if (count(routes, 'audience: { kind: "driver", driverIdKey: "driver_id"') < 2) {
    failures.push("both assignment lifecycle notices must target the canonical driver audience");
  }
  if (!loads.includes('enqueueOutboxEvent(\n          client,\n          "load.abandoned"')) {
    failures.push("abandoned transition must enqueue load.abandoned on its scoped transaction client");
  }
  const abandonedEvent = loads.indexOf('"load.abandoned"');
  const transitionReturn = loads.indexOf("driver_bill_mint: driverBillOutcome", abandonedEvent);
  if (abandonedEvent < 0 || transitionReturn < 0 || abandonedEvent > transitionReturn) {
    failures.push("load.abandoned enqueue must occur before the transition transaction returns");
  }
  if (!routes.includes('eventType: "load.abandoned"')) {
    failures.push("load.abandoned needs a registered operational-notice route");
  }
  const abandonedFn = dispatcher.slice(dispatcher.indexOf("export async function notifyAbandonedLoadStakeholders"));
  if (/withLuciaBypass[\s\S]{0,1800}?\.catch\(\(\) => null\)/.test(abandonedFn)) {
    failures.push("abandoned-load detail read failures must propagate, not fabricate fallback context");
  }
  return failures;
}

const production = Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, readFileSync(file, "utf8")]));

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["quick durable enqueue", { ...production, quick: production.quick.replace('enqueueOutboxEvent(\n          client,\n          "load.assigned_to_driver"', 'enqueueOutboxEvent(\n          client,\n          "load.assigned_REMOVED"') }],
    ["previous-driver enqueue", { ...production, reassign: production.reassign.replace('"load.reassigned_away_from_driver"', '"load.reassigned_away_REMOVED"') }],
    ["assigned handler", { ...production, routes: production.routes.replace('eventType: "load.assigned_to_driver"', 'eventType: "load.assigned_REMOVED"') }],
    ["reassigned-away handler", { ...production, routes: production.routes.replace('eventType: "load.reassigned_away_from_driver"', 'eventType: "load.reassigned_away_REMOVED"') }],
    ["quick duplicate direct push", { ...production, quick: `${production.quick}\nvoid notifyLoadAssigned({}).catch(() => undefined);` }],
    ["reassign duplicate direct push", { ...production, reassign: `${production.reassign}\nvoid notifyLoadReassignedAway({}).catch(() => undefined);` }],
    ["abandoned durable enqueue", { ...production, loads: production.loads.replace('"load.abandoned"', '"load.abandoned_REMOVED"') }],
    ["abandoned handler", { ...production, routes: production.routes.replace('eventType: "load.abandoned"', 'eventType: "load.abandoned_REMOVED"') }],
    ["abandoned detail failure swallow", { ...production, dispatcher: production.dispatcher.replace("  });\n\n  const loadNo = String(detail?.load_number", "  }).catch(() => null);\n\n  const loadNo = String(detail?.load_number") }],
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
console.log("verify-dispatch-assignment-notice-durability PASS — assignment, reassignment, and abandonment notices are transactional, durable, and handled");
