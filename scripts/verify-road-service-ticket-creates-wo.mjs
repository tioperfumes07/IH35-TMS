#!/usr/bin/env node
/**
 * CLOSURE-7 P5-T17 — road service ticket create-wo must link WO + Bill.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const paths = {
  migration: path.join(ROOT, "apps/backend/src/migrations/0395-road-service-tickets.sql"),
  routes: path.join(ROOT, "apps/backend/src/maintenance/road-service/tickets.routes.ts"),
  woIntegration: path.join(ROOT, "apps/backend/src/maintenance/road-service/wo-integration.ts"),
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
  const woIntegration = read(paths.woIntegration);
  const tests = read(paths.tests);
  const hook = read(paths.hook);
  const list = read(paths.list);
  const modal = read(paths.modal);
  const maintenanceHome = read(paths.maintenanceHome);

  if (!migration) fail("missing migration 0395-road-service-tickets.sql");
  if (!routes) fail("missing road-service/tickets.routes.ts");
  if (!woIntegration) fail("missing road-service/wo-integration.ts");
  if (!tests) fail("missing road-service/tickets.test.ts");
  if (!hook) fail("missing useRoadServiceTickets.ts");
  if (!list) fail("missing RoadServiceList.tsx");
  if (!modal) fail("missing RoadServiceTicketModal.tsx");
  if (!maintenanceHome) fail("missing MaintenanceHome.tsx road service sub-tab");

  if (!migration.includes("CREATE TABLE IF NOT EXISTS maintenance.road_service_tickets")) {
    fail("migration must create maintenance.road_service_tickets");
  }
  if (!migration.includes("wo_id")) {
    fail("migration must include wo_id FK");
  }
  if (!migration.includes("bill_id")) {
    fail("migration must include bill_id column");
  }

  if (!routes.includes('app.post("/api/v1/road-service-tickets"')) {
    fail("routes must expose POST /api/v1/road-service-tickets");
  }
  if (!routes.includes('app.patch("/api/v1/road-service-tickets/:id/complete"')) {
    fail("routes must expose PATCH complete");
  }
  if (!routes.includes('app.post("/api/v1/road-service-tickets/:id/create-wo"')) {
    fail("routes must expose POST create-wo");
  }
  if (!routes.includes('app.get("/api/v1/road-service-tickets"')) {
    fail("routes must expose GET list");
  }

  if (!woIntegration.includes("createWorkOrderFromRoadServiceTicket")) {
    fail("wo-integration must export createWorkOrderFromRoadServiceTicket");
  }
  if (!woIntegration.includes('source_type: "ES"')) {
    fail("wo-integration must use source_type ES");
  }
  if (!woIntegration.includes("autoCreateBillFromWO")) {
    fail("wo-integration must auto-create vendor bill");
  }
  if (!woIntegration.includes("bill_terms")) {
    fail("wo-integration must set Net 30 bill terms");
  }

  if (!tests.includes("creates open road service ticket")) {
    fail("tests must cover ticket creation");
  }
  if (!tests.includes("create-wo returns wo_id and bill_id")) {
    fail("tests must cover create-wo");
  }

  if (!hook.includes("/api/v1/road-service-tickets")) {
    fail("useRoadServiceTickets must call road-service API");
  }
  if (!hook.includes("create-wo")) {
    fail("hook must expose create-wo mutation");
  }

  if (!list.includes("road-service-list")) {
    fail("RoadServiceList must render status filter table");
  }
  if (!maintenanceHome.includes("road_service")) {
    fail("MaintenanceHome must include road_service sub-tab");
  }
  if (!maintenanceHome.includes("RoadServiceList")) {
    fail("MaintenanceHome must render RoadServiceList");
  }

  console.log("verify:road-service-ticket-creates-wo OK");
}

main();
