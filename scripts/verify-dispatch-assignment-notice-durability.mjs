#!/usr/bin/env node
import { readFileSync } from "node:fs";

const FILES = {
  quick: "apps/backend/src/dispatch/quick-assign.service.ts",
  reassign: "apps/backend/src/dispatch/dispatch-refinements.service.ts",
  routes: "apps/backend/src/outbox/handlers/operational-notice.routes.ts",
  loads: "apps/backend/src/dispatch/loads.routes.ts",
  dispatcher: "apps/backend/src/notifications/dispatcher.ts",
  noticeHandler: "apps/backend/src/outbox/handlers/operational-notice.handler.ts",
  trailHandlers: "apps/backend/src/outbox/handlers/trail-events.handler.ts",
  registry: "apps/backend/src/outbox/handlers/registry.ts",
  distributionFailure: "apps/backend/src/outbox/handlers/dispatch-distribution-failure.handler.ts",
  dispatchedHandler: "apps/backend/src/outbox/handlers/dispatch-load-dispatched.handler.ts",
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
  const noticeHandler = files.noticeHandler ?? "";
  const trailHandlers = files.trailHandlers ?? "";
  const registry = files.registry ?? "";
  const distributionFailure = files.distributionFailure ?? "";
  const dispatchedHandler = files.dispatchedHandler ?? "";

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
  if (/notifyAbandonedLoadStakeholders/.test(loads)) {
    failures.push("abandoned transition must not launch a swallowed post-commit delivery outside the durable outbox");
  }
  if (/new TrailEventHandler\(["']load\.abandoned["']\)/.test(trailHandlers)) {
    failures.push("trail-only load.abandoned handler must not overwrite the real operational consumer");
  }
  if (!/multiChannelRoles:\s*\["Owner", "Administrator"\]/.test(routes)) {
    failures.push("load.abandoned route must declare durable Owner/Administrator multi-channel delivery");
  }
  if (!/route\.multiChannelRoles[\s\S]{0,1000}?dispatchNotification\([\s\S]{0,500}?failures\.length/.test(noticeHandler)) {
    failures.push("operational handler must execute and fail loud on durable multi-channel delivery results");
  }
  if (!/if \(registry\.has\(handler\.eventType\)\)[\s\S]{0,120}?throw new Error\(`duplicate_outbox_handler:\$\{handler\.eventType\}`\)/.test(registry)) {
    failures.push("outbox registry must fail startup on duplicate event handlers instead of silently overwriting");
  }
  if (!/return buildUniqueOutboxHandlerMap\(handlers\)/.test(registry)) {
    failures.push("production outbox registry must use duplicate-rejecting construction");
  }
  if (!/const notification = await createNotification\([\s\S]{0,700}?if \(!notification\?\.id\)[\s\S]{0,180}?notification_insert_returned_no_identity/.test(noticeHandler)) {
    failures.push("operational notices must require persisted notification identity before acknowledging delivery");
  }
  if (!/LEFT JOIN org\.user_company_access uca[\s\S]{0,300}?uca\.company_id = \$1::uuid[\s\S]{0,180}?uca\.deactivated_at IS NULL/.test(noticeHandler)) {
    failures.push("role-based operational notices must resolve only active memberships for the event company");
  }
  if (!/u\.default_company_id = \$1::uuid[\s\S]{0,100}?OR uca\.user_id IS NOT NULL/.test(noticeHandler)) {
    failures.push("role-based operational notices must include the user's canonical default company without widening globally");
  }
  if (!/resolveByRoles\(ctx, operatingCompanyId, route\.audience\.roles\)/.test(noticeHandler) ||
      !/resolveByRoles\(ctx, operatingCompanyId, route\.audience\.fallbackRoles\)/.test(noticeHandler)) {
    failures.push("both role and driver-fallback audiences must pass immutable event company scope");
  }
  if (!/LEFT JOIN org\.user_company_access uca[\s\S]{0,260}?uca\.company_id = \$1::uuid[\s\S]{0,180}?uca\.deactivated_at IS NULL/.test(distributionFailure) ||
      !/u\.default_company_id = \$1::uuid OR uca\.user_id IS NOT NULL/.test(distributionFailure)) {
    failures.push("distribution-failure alerts must resolve Owner/Dispatcher recipients only inside the event company");
  }
  if (!/const notification = await createNotification\([\s\S]{0,700}?if \(!notification\?\.id\)[\s\S]{0,180}?distribution_failure_notification_insert_returned_no_identity/.test(distributionFailure)) {
    failures.push("distribution-failure alerts must require persisted notification identity before acknowledging delivery");
  }
  if (!/await distributeLoadInstructions\([\s\S]{0,300}?lastError = null;[\s\S]{0,60}?break;/.test(dispatchedHandler)) {
    failures.push("a successful instruction-distribution retry must clear the prior error before delivery is acknowledged");
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
    ["abandoned detached delivery restored", { ...production, loads: `${production.loads}\nvoid notifyAbandonedLoadStakeholders({}).catch(() => undefined);` }],
    ["abandoned trail overwrite restored", { ...production, trailHandlers: `${production.trailHandlers}\nnew TrailEventHandler("load.abandoned");` }],
    ["abandoned multichannel route removed", { ...production, routes: production.routes.replace('multiChannelRoles: ["Owner", "Administrator"],', "") }],
    ["abandoned delivery failure ignored", { ...production, noticeHandler: production.noticeHandler.replace("if (failures.length) {", "if (false) {") }],
    ["registry duplicate rejection removed", { ...production, registry: production.registry.replace("if (registry.has(handler.eventType)) {", "if (false) {") }],
    ["registry bypasses unique builder", { ...production, registry: production.registry.replace("return buildUniqueOutboxHandlerMap(handlers);", "return new Map(handlers.map((handler) => [handler.eventType, handler]));") }],
    ["notification identity check removed", { ...production, noticeHandler: production.noticeHandler.replace("if (!notification?.id) {", "if (false) {") }],
    ["notice role company join removed", { ...production, noticeHandler: production.noticeHandler.replace("LEFT JOIN org.user_company_access uca", "LEFT JOIN org.user_company_access_REMOVED uca") }],
    ["notice default company arm removed", { ...production, noticeHandler: production.noticeHandler.replace("u.default_company_id = $1::uuid", "u.default_company_id = NULL") }],
    ["notice fallback scope dropped", { ...production, noticeHandler: production.noticeHandler.replace("resolveByRoles(ctx, operatingCompanyId, route.audience.fallbackRoles)", "resolveByRoles(ctx, route.audience.fallbackRoles)") }],
    ["distribution failure company join removed", { ...production, distributionFailure: production.distributionFailure.replace("LEFT JOIN org.user_company_access uca", "LEFT JOIN org.user_company_access_REMOVED uca") }],
    ["distribution failure identity check removed", { ...production, distributionFailure: production.distributionFailure.replace("if (!notification?.id) {", "if (false) {") }],
    ["successful retry retains stale error", { ...production, dispatchedHandler: production.dispatchedHandler.replace("lastError = null;", "// stale error retained") }],
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
