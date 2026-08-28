#!/usr/bin/env node
/**
 * Block B21-D5: Dispatch detention board — accrual from stop arrivals + billing bridge + customer notify.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const paths = {
  migration: path.join(ROOT, "db/migrations/0353_dispatch_detention_events.sql"),
  page: path.join(ROOT, "apps/frontend/src/pages/dispatch/DetentionBoardPage.tsx"),
  pageTest: path.join(ROOT, "apps/frontend/src/pages/dispatch/__tests__/DetentionBoardPage.test.tsx"),
  routes: path.join(ROOT, "apps/backend/src/dispatch/detention.routes.ts"),
  service: path.join(ROOT, "apps/backend/src/dispatch/detention.service.ts"),
  routeTest: path.join(ROOT, "apps/backend/src/dispatch/__tests__/detention.routes.test.ts"),
  index: path.join(ROOT, "apps/backend/src/index.ts"),
  dispatchApi: path.join(ROOT, "apps/frontend/src/api/dispatch.ts"),
  manifest: path.join(ROOT, "apps/frontend/src/routes/manifest.tsx"),
  sidebar: path.join(ROOT, "apps/frontend/src/components/layout/sidebar-config.ts"),
  archDesign: path.join(ROOT, "docs/specs/IH35_ARCHITECTURAL_DESIGN.md"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function fail(msg) {
  console.error(`verify:dispatch-detention-board FAIL: ${msg}`);
  process.exit(1);
}

function main() {
  const migration = read(paths.migration);
  const page = read(paths.page);
  const pageTest = read(paths.pageTest);
  const routes = read(paths.routes);
  const service = read(paths.service);
  const routeTest = read(paths.routeTest);
  const index = read(paths.index);
  const dispatchApi = read(paths.dispatchApi);
  const manifest = read(paths.manifest);
  const sidebar = read(paths.sidebar);
  const archDesign = read(paths.archDesign);
  const failures = [];

  if (!migration.includes("dispatch.detention_events")) failures.push("migration 0353 must create detention_events");
  if (!page.includes("dispatch-detention-board-page")) failures.push("DetentionBoardPage must expose test id");
  if (!page.includes("detention-elapsed")) failures.push("DetentionBoardPage must show elapsed timer");
  if (!page.includes("Bridge to billing")) failures.push("DetentionBoardPage must expose billing bridge action");
  if (!page.includes("boardQ.isError") || !page.includes("ListErrorState") || !page.includes("boardQ.refetch()")) {
    failures.push("DetentionBoardPage must distinguish board failure from honest empty state and expose retry");
  }
  if ((pageTest.match(/\bit\(/g) ?? []).length < 3) failures.push("DetentionBoardPage tests must cover at least 3 cases");
  if ((routeTest.match(/\bit\(/g) ?? []).length < 5) failures.push("detention.routes tests must cover at least 5 cases");

  if (!routes.includes("/api/v1/dispatch/detention/board")) failures.push("detention routes must expose board endpoint");
  if (!service.includes("dispatch.stop_arrivals")) failures.push("detention service must sync from stop_arrivals");
  if (!service.includes("accessorial_bridge_rows")) failures.push("detention service must bridge to accessorial rows");
  if (!service.includes("sendEmail")) failures.push("detention service must notify customer via email");
  if (!service.includes("pg_advisory_xact_lock") || !service.includes("dispatch.detention.customer-notify:")) {
    failures.push("customer threshold notification must serialize the external-send lifecycle per company event");
  }
  if (!service.includes("FOR UPDATE OF de")) {
    failures.push("customer threshold notification must lock the canonical detention row before eligibility evaluation");
  }
  if (!service.includes("AND customer_notified_at IS NULL") || !service.includes("RETURNING customer_notified_at::text")) {
    failures.push("customer threshold notification must claim the exact company row before sending");
  }
  const claimPos = service.indexOf("RETURNING customer_notified_at::text");
  const sendPos = service.indexOf("await sendEmail", claimPos);
  if (claimPos < 0 || sendPos < claimPos) {
    failures.push("customer threshold notification must durably claim before the external send");
  }
  if (!service.includes('error: "already_notified"')) {
    failures.push("customer threshold notification must reject a lost notification claim");
  }
  if (!index.includes("registerDispatchDetentionRoutes")) failures.push("backend index must register detention routes");

  if (!dispatchApi.includes("getDetentionBoard")) failures.push("dispatch API must export getDetentionBoard");
  if (!dispatchApi.includes("bridgeDetentionBilling")) failures.push("dispatch API must export bridgeDetentionBilling");
  if (!manifest.includes('path="/dispatch/detention"')) failures.push("manifest must route /dispatch/detention");

  const dispatchFlyout = sidebar.split('case "dispatch"')[1]?.split("case ")[0] ?? "";
  if (!dispatchFlyout.includes("/dispatch/detention")) failures.push("sidebar flyout must link detention board");

  if (!archDesign.includes("verify:dispatch-detention-board")) {
    failures.push("ARCHITECTURAL_DESIGN must reference verify:dispatch-detention-board");
  }

  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail(failures.join("; "));
  }

  console.log("verify:dispatch-detention-board PASS");
}

if (process.argv.includes("--selftest")) {
  const original = fs.readFileSync(paths.service, "utf8");
  const mutations = [
    ["advisory lifecycle lock", original.replace("pg_advisory_xact_lock", "pg_advisory_xact_unlock")],
    ["canonical row lock", original.replace("FOR UPDATE OF de", "")],
    ["exact claim predicate", original.replace("AND customer_notified_at IS NULL", "AND customer_notified_at IS NOT NULL")],
    ["claim identity", original.replace("RETURNING customer_notified_at::text", "RETURNING id::text")],
  ];
  let rejected = 0;
  for (const [, mutated] of mutations) {
    fs.writeFileSync(paths.service, mutated);
    try {
      const result = await import(`node:child_process`).then(({ spawnSync }) =>
        spawnSync(process.execPath, [process.argv[1]], { cwd: ROOT, encoding: "utf8" })
      );
      if (result.status !== 0) rejected += 1;
    } finally {
      fs.writeFileSync(paths.service, original);
    }
  }
  if (rejected !== mutations.length) fail(`selftest rejected ${rejected}/${mutations.length} planted defects`);
  console.log(`verify:dispatch-detention-board selftest PASS (${rejected}/${mutations.length})`);
} else {
  main();
}
