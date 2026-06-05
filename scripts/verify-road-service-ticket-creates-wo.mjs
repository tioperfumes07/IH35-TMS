#!/usr/bin/env node
/**
 * CLOSURE-7 P5-T17 — road service ticket create-wo produces WO + vendor bill refs.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const paths = {
  migration: path.join(ROOT, "apps/backend/src/migrations/0395-road-service-tickets.sql"),
  routes: path.join(ROOT, "apps/backend/src/maintenance/road-service/tickets.routes.ts"),
  integration: path.join(ROOT, "apps/backend/src/maintenance/road-service/wo-integration.ts"),
  tests: path.join(ROOT, "apps/backend/src/maintenance/road-service/tickets.test.ts"),
  hook: path.join(ROOT, "apps/frontend/src/hooks/useRoadServiceTickets.ts"),
  list: path.join(ROOT, "apps/frontend/src/pages/maintenance/RoadServiceList.tsx"),
  modal: path.join(ROOT, "apps/frontend/src/pages/maintenance/RoadServiceTicketModal.tsx"),
  maintenanceHome: path.join(ROOT, "apps/frontend/src/pages/maintenance/MaintenanceHome.tsx"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf8");
}

function fail(message) {
  console.error(`verify:road-service-ticket-creates-wo FAILED\n- ${message}`);
  process.exit(1);
}

function main() {
  const migration = read(paths.migration);
  const routes = read(paths.routes);
  const integration = read(paths.integration);
  const tests = read(paths.tests);
  const hook = read(paths.hook);
  const list = read(paths.list);
  const modal = read(paths.modal);
  const maintenanceHome = read(paths.maintenanceHome);

  if (!migration) fail("missing migration 0395-road-service-tickets.sql");
  if (!routes) fail("missing road-service/tickets.routes.ts");
  if (!integration) fail("missing wo-integration.ts");
  if (!tests) fail("missing tickets.test.ts");
  if (!hook) fail("missing useRoadServiceTickets.ts");
  if (!list) fail("missing RoadServiceList.tsx");
  if (!modal) fail("missing RoadServiceTicketModal.tsx");
  if (!maintenanceHome) fail("missing MaintenanceHome.tsx road service sub-tab");

  if (!migration.includes("CREATE TABLE IF NOT EXISTS maintenance.road_service_tickets")) {
    fail("migration must create maintenance.road_service_tickets");
  }
  if (!migration.includes("wo_id")) fail("migration must include wo_id FK");
  if (!migration.includes("bill_id")) fail("migration must include bill_id column");

  if (!routes.includes('app.post("/api/v1/road-service-tickets"')) {
    fail("routes must expose POST /api/v1/road-service-tickets");
  }
  if (!routes.includes('app.patch("/api/v1/road-service-tickets/:id/complete"')) {
    fail("routes must expose PATCH complete endpoint");
  }
  if (!routes.includes('app.post("/api/v1/road-service-tickets/:id/create-wo"')) {
    fail("routes must expose POST create-wo endpoint");
  }

  if (!integration.includes("createWorkOrderFromRoadServiceTicket")) {
    fail("wo-integration must export createWorkOrderFromRoadServiceTicket");
  }
  if (!integration.includes('source_type: "ES"')) {
    fail("wo-integration must create ES source_type work orders");
  }
  if (!integration.includes("autoCreateBillFromWO")) {
    fail("wo-integration must auto-create vendor bill from WO");
  }

  if (!tests.includes("create-wo returns wo_id and bill_id")) {
    fail("tests must cover create-wo WO + bill linkage");
  }

  if (!hook.includes("/api/v1/road-service-tickets")) {
    fail("useRoadServiceTickets must call road-service-tickets API");
  }

  if (!list.includes("road-service-status-filter")) {
    fail("RoadServiceList must render status filter controls");
  }
  if (!maintenanceHome.includes("road_service")) {
    fail("MaintenanceHome must include road_service sub-tab");
  }
  if (!modal.includes("road-service-ticket-modal")) {
    fail("RoadServiceTicketModal must render quick-entry form");
  }

  console.log("verify:road-service-ticket-creates-wo OK");
}

main();
