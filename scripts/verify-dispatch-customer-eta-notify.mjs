#!/usr/bin/env node
/**
 * Block B21-D9: Customer ETA notify — milestone SMS/email dispatch + delivery log.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const paths = {
  migration: path.join(ROOT, "db/migrations/0355_dispatch_notify_log.sql"),
  page: path.join(
    ROOT,
    "apps/frontend/src/pages/dispatch/NotifyPreferencesPage.tsx",
  ),
  pageTest: path.join(
    ROOT,
    "apps/frontend/src/pages/dispatch/__tests__/NotifyPreferencesPage.test.tsx",
  ),
  routes: path.join(
    ROOT,
    "apps/backend/src/dispatch/customer-notify.routes.ts",
  ),
  service: path.join(
    ROOT,
    "apps/backend/src/dispatch/customer-notify.service.ts",
  ),
  routeTest: path.join(
    ROOT,
    "apps/backend/src/dispatch/__tests__/customer-notify.routes.test.ts",
  ),
  index: path.join(ROOT, "apps/backend/src/index.ts"),
  dispatchApi: path.join(ROOT, "apps/frontend/src/api/dispatch.ts"),
  manifest: path.join(ROOT, "apps/frontend/src/routes/manifest.tsx"),
  sidebar: path.join(
    ROOT,
    "apps/frontend/src/components/layout/sidebar-config.ts",
  ),
  archDesign: path.join(ROOT, "docs/specs/IH35_ARCHITECTURAL_DESIGN.md"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function fail(msg) {
  console.error(`verify:dispatch-customer-eta-notify FAIL: ${msg}`);
  process.exit(1);
}

function verifySources({
  migration,
  page,
  pageTest,
  routes,
  service,
  routeTest,
  index,
  dispatchApi,
  manifest,
  sidebar,
  archDesign,
}) {
  const failures = [];
  if (!service.includes("async function claimNotifyDelivery"))
    failures.push("delivery must be claimed before provider send");
  if (
    !/INSERT INTO dispatch\.notify_log[\s\S]{0,900}status[\s\S]{0,300}'pending'[\s\S]{0,500}ON CONFLICT[\s\S]{0,500}DO NOTHING[\s\S]{0,200}RETURNING id::text/.test(
      service,
    )
  ) {
    failures.push(
      "delivery claim must atomically INSERT pending with conflict refusal and return its id",
    );
  }
  if (
    !/const logId = await claimNotifyDelivery[\s\S]{0,500}if \(!logId\)[\s\S]{0,180}skipped \+= 1/.test(
      service,
    )
  ) {
    failures.push(
      "provider delivery must skip when another worker owns the durable claim",
    );
  }
  if ((service.match(/await finishNotifyDelivery\(client/g) ?? []).length < 4) {
    failures.push(
      "email and SMS success/failure paths must finalize their durable claim",
    );
  }
  if (/alreadyLogged\(/.test(service))
    failures.push("SELECT-then-send dedupe race must not return");
  if (!migration.includes("dispatch.notify_log"))
    failures.push("migration 0355 must create notify_log");
  if (!migration.includes("dispatch.customer_notify_preferences"))
    failures.push("migration 0355 must create customer_notify_preferences");
  if (!page.includes("dispatch-notify-preferences-page"))
    failures.push("NotifyPreferencesPage must expose test id");
  if (!page.includes("notify-preferences-panel"))
    failures.push("NotifyPreferencesPage must expose preferences panel");
  if (!page.includes("Delivery log"))
    failures.push("NotifyPreferencesPage must show delivery log");
  if (!/useEffect\(\(\) => \{[\s\S]{0,100}setCustomerId\(initialCustomerId\);[\s\S]{0,80}\}, \[initialCustomerId\]\);/.test(page))
    failures.push("customer reverse drill must resynchronize the mounted picker when customer_id changes");
  if ((pageTest.match(/\bit\(/g) ?? []).length < 2)
    failures.push("NotifyPreferencesPage tests must cover at least 2 cases");
  if ((routeTest.match(/\bit\(/g) ?? []).length < 4)
    failures.push("customer-notify routes tests must cover at least 4 cases");

  if (!routes.includes("/api/v1/dispatch/customer-notify/log"))
    failures.push("routes must expose notify log endpoint");
  if (
    !routes.includes("/api/v1/dispatch/customer-notify/preferences/:customerId")
  )
    failures.push("routes must expose preferences endpoint");
  if (!routes.includes("/api/v1/dispatch/customer-notify/sync"))
    failures.push("routes must expose sync endpoint");
  if (!service.includes("processStopArrivalNotifications"))
    failures.push("service must subscribe to stop arrivals");
  if (!service.includes("processEtaUpdateNotifications"))
    failures.push("service must subscribe to ETA updates");
  const activeRouteStops = service.match(/stop_type = '(?:pickup|delivery)' AND soft_deleted_at IS NULL/g)?.length ?? 0;
  if (activeRouteStops < 2)
    failures.push("notification route labels must resolve pickup and delivery from active stops only");
  const activeMilestoneStops = service.match(/AND ls\.soft_deleted_at IS NULL/g)?.length ?? 0;
  if (activeMilestoneStops < 2)
    failures.push("arrival and departure notifications must exclude retired stop events");
  if (!service.includes("sendEmail"))
    failures.push("service must dispatch email");
  if (!service.includes("sendSms")) failures.push("service must dispatch SMS");
  if (!service.includes("dispatch.notify_log"))
    failures.push("service must log delivery confirmations");
  if (!/COALESCE\([\s\S]{0,120}c\.customer_name,[\s\S]{0,180}mdata\.resolve_customer_label_same_company\(nl\.customer_id, nl\.operating_company_id\)[\s\S]{0,80}AS customer_name/.test(service))
    failures.push("delivery history must resolve the preserved same-company customer label");
  if (!/LEFT JOIN mdata\.customers c ON c\.id = nl\.customer_id[\s\S]{0,100}c\.operating_company_id = nl\.operating_company_id/.test(service))
    failures.push("delivery history customer label join must not erase preserved notifications");
  if (!/const preferences = res\.rows\[0\];[\s\S]{0,140}?if \(!preferences\?\.customer_id\)[\s\S]{0,100}?E_NOTIFY_PREFERENCES_WRITE_FAILED[\s\S]{0,600}?appendCrudAudit/.test(service)) {
    failures.push("preference upsert must prove its returned canonical customer identity before audit/success");
  }
  const preferenceWriteRoute = routes.split('app.put("/api/v1/dispatch/customer-notify/preferences/:customerId"')[1]?.split('app.post("/api/v1/dispatch/customer-notify/sync"')[0] ?? "";
  const preferenceReadRoute = routes.split('app.get("/api/v1/dispatch/customer-notify/preferences/:customerId"')[1]?.split('app.put("/api/v1/dispatch/customer-notify/preferences/:customerId"')[0] ?? "";
  if (!/E_NOTIFY_PREFERENCES_WRITE_FAILED[\s\S]{0,180}?reply\.code\(409\)\.send\(\{ error: "notify_preferences_write_failed" \}\)/.test(preferenceWriteRoute)) {
    failures.push("preference lost-write must return an honest typed 409 instead of 200/undefined or raw 500");
  }
  if (preferenceReadRoute.includes("E_NOTIFY_PREFERENCES_WRITE_FAILED")) {
    failures.push("preference read route must not mask a misplaced write-failure mapping");
  }
  if (!index.includes("registerDispatchCustomerNotifyRoutes"))
    failures.push("backend index must register customer notify routes");

  if (!dispatchApi.includes("getCustomerNotifyLog"))
    failures.push("dispatch API must export getCustomerNotifyLog");
  if (!dispatchApi.includes("syncCustomerNotify"))
    failures.push("dispatch API must export syncCustomerNotify");
  if (!manifest.includes('path="/dispatch/notify-preferences"'))
    failures.push("manifest must route /dispatch/notify-preferences");

  const dispatchFlyout =
    sidebar.split('case "dispatch"')[1]?.split("case ")[0] ?? "";
  if (!dispatchFlyout.includes("/dispatch/notify-preferences"))
    failures.push("sidebar flyout must link notify preferences");

  if (!archDesign.includes("verify:dispatch-customer-eta-notify")) {
    failures.push(
      "ARCHITECTURAL_DESIGN must reference verify:dispatch-customer-eta-notify",
    );
  }

  return failures;
}

function main() {
  const sources = {
    migration: read(paths.migration),
    page: read(paths.page),
    pageTest: read(paths.pageTest),
    routes: read(paths.routes),
    service: read(paths.service),
    routeTest: read(paths.routeTest),
    index: read(paths.index),
    dispatchApi: read(paths.dispatchApi),
    manifest: read(paths.manifest),
    sidebar: read(paths.sidebar),
    archDesign: read(paths.archDesign),
  };
  const failures = verifySources(sources);
  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail(failures.join("; "));
  }

  if (process.argv.includes("--selftest")) {
    const mutations = [
      [
        "drop mounted customer deep-link synchronization",
        "page",
        sources.page.replace("setCustomerId(initialCustomerId);", "setCustomerId(customerId);")
      ],
      [
        "drop preference persistence proof",
        "service",
        sources.service.replace("if (!preferences?.customer_id) {", "if (false) {")
      ],
      [
        "drop preference lost-write route",
        "routes",
        sources.routes.replace('if ((error as Error).message === "E_NOTIFY_PREFERENCES_WRITE_FAILED") {', "if (false) {")
      ],
      [
        "misplace preference lost-write mapping on read route",
        "routes",
        sources.routes.replace(
          'if ((error as Error).message === "E_CUSTOMER_NOT_FOUND") return reply.code(404).send({ error: "customer_not_found" });\n      throw error;',
          'if ((error as Error).message === "E_CUSTOMER_NOT_FOUND") return reply.code(404).send({ error: "customer_not_found" });\n      if ((error as Error).message === "E_NOTIFY_PREFERENCES_WRITE_FAILED") return reply.code(409).send({ error: "notify_preferences_write_failed" });\n      throw error;',
        ),
      ],
      [
        "drop atomic claim",
        "service",
        sources.service.replace(
          "async function claimNotifyDelivery",
          "async function lostNotifyDelivery",
        ),
      ],
      [
        "restore check-then-send race",
        "service",
        sources.service.replaceAll("claimNotifyDelivery", "alreadyLogged"),
      ],
      [
        "drop conflict refusal",
        "service",
        sources.service.replace(
          "DO NOTHING",
          "DO UPDATE SET updated_at = now()",
        ),
      ],
      [
        "drop claim finalization",
        "service",
        sources.service.replaceAll(
          "await finishNotifyDelivery(client",
          "await Promise.resolve(client",
        ),
      ],
      [
        "restore retired route labels",
        "service",
        sources.service.replace("AND soft_deleted_at IS NULL ORDER BY sequence_number ASC", "ORDER BY sequence_number ASC"),
      ],
      [
        "restore retired milestone events",
        "service",
        sources.service.replace("AND ls.soft_deleted_at IS NULL", "AND TRUE"),
      ],
      [
        "erase notification history with an inactive-customer inner join",
        "service",
        sources.service.replace("LEFT JOIN mdata.customers c ON c.id = nl.customer_id", "JOIN mdata.customers c ON c.id = nl.customer_id"),
      ],
      [
        "drop historical notification customer label resolution",
        "service",
        sources.service.replace("mdata.resolve_customer_label_same_company(nl.customer_id, nl.operating_company_id)", "NULL"),
      ],
    ];
    for (const [name, key, source] of mutations) {
      if (verifySources({ ...sources, [key]: source }).length === 0)
        fail(`selftest mutation survived: ${name}`);
    }
    console.log(
      `verify:dispatch-customer-eta-notify selftest PASS (${mutations.length}/${mutations.length})`,
    );
  }

  console.log("verify:dispatch-customer-eta-notify PASS");
}

main();
