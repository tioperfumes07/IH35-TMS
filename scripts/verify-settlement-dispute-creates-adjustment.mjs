#!/usr/bin/env node
/**
 * CLOSURE-5 P5-T13 — settlement dispute approval must create QBO JE + dispute_adjustment line.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const paths = {
  migration: path.join(ROOT, "apps/backend/src/migrations/0393-settlement-disputes.sql"),
  routes: path.join(ROOT, "apps/backend/src/settlements/disputes/disputes.routes.ts"),
  tests: path.join(ROOT, "apps/backend/src/settlements/disputes/disputes.test.ts"),
  hook: path.join(ROOT, "apps/frontend/src/hooks/useSettlementDisputes.ts"),
  list: path.join(ROOT, "apps/frontend/src/pages/drivers/SettlementDisputeList.tsx"),
  modal: path.join(ROOT, "apps/frontend/src/pages/drivers/SettlementDisputeModal.tsx"),
  driversPage: path.join(ROOT, "apps/frontend/src/pages/drivers/DriversPage.tsx"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf8");
}

function fail(message) {
  console.error(`verify:settlement-dispute-creates-adjustment FAILED\n- ${message}`);
  process.exit(1);
}

function main() {
  const migration = read(paths.migration);
  const routes = read(paths.routes);
  const tests = read(paths.tests);
  const hook = read(paths.hook);
  const list = read(paths.list);
  const modal = read(paths.modal);
  const driversPage = read(paths.driversPage);

  if (!migration) fail("missing migration 0393-settlement-disputes.sql");
  if (!routes) fail("missing settlements/disputes/disputes.routes.ts");
  if (!tests) fail("missing settlements/disputes/disputes.test.ts");
  if (!hook) fail("missing useSettlementDisputes.ts");
  if (!list) fail("missing SettlementDisputeList.tsx");
  if (!modal) fail("missing SettlementDisputeModal.tsx");
  if (!driversPage) fail("missing DriversPage.tsx disputes sub-tab");

  if (!migration.includes("CREATE TABLE IF NOT EXISTS settlements.settlement_disputes")) {
    fail("migration must create settlements.settlement_disputes");
  }
  if (!migration.includes("evidence_doc_ids")) {
    fail("migration must include evidence_doc_ids array column");
  }
  if (!migration.includes("'dispute_adjustment'")) {
    fail("migration must allow settlement line type dispute_adjustment");
  }

  if (!routes.includes('app.post("/api/v1/settlements/:id/disputes"')) {
    fail("routes must expose POST /api/v1/settlements/:id/disputes");
  }
  if (!routes.includes('app.get("/api/v1/settlement-disputes"')) {
    fail("routes must expose GET /api/v1/settlement-disputes");
  }
  if (!routes.includes('app.patch("/api/v1/settlement-disputes/:id/review"')) {
    fail("routes must expose PATCH /api/v1/settlement-disputes/:id/review");
  }
  if (!routes.includes("evidence_doc_ids")) {
    fail("create dispute route must accept evidence_doc_ids");
  }
  if (!routes.includes("createCorrectiveJournalEntry")) {
    fail("review approval must create corrective journal entry");
  }
  if (!routes.includes("dispute_adjustment")) {
    fail("review approval must insert supplemental settlement line type dispute_adjustment");
  }
  if (!routes.includes("qbo_adjustment_je_id")) {
    fail("review must persist qbo_adjustment_je_id");
  }

  if (!tests.includes("evidence_doc_ids")) {
    fail("route tests must cover evidence_doc_ids array");
  }
  if (!tests.includes("E_OWNER_ONLY")) {
    fail("route tests must assert owner-only review");
  }

  if (!hook.includes("/api/v1/settlement-disputes")) {
    fail("useSettlementDisputes must call /api/v1/settlement-disputes");
  }
  if (!hook.includes("/api/v1/settlements/")) {
    fail("useSettlementDisputes must call POST /api/v1/settlements/:id/disputes");
  }

  if (!list.includes("dispute-status-filter")) {
    fail("SettlementDisputeList must render status filter controls");
  }
  if (!driversPage.includes("drivers-disputes-tab")) {
    fail("DriversPage must render Disputes sub-tab");
  }
  if (!driversPage.includes("openCount")) {
    fail("DriversPage Disputes tab must show open-count badge");
  }
  if (!modal.includes("evidence")) {
    fail("SettlementDisputeModal must support evidence file uploads");
  }

  console.log("verify:settlement-dispute-creates-adjustment OK");
}

main();
