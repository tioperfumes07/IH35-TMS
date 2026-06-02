import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("fault rules routes", () => {
  it("registers CRUD fault rule endpoints", () => {
    const routes = fs.readFileSync(
      path.join(here, "../../src/maintenance/fault-auto-wo/fault-rules.routes.ts"),
      "utf8"
    );
    assert.match(routes, /\/api\/v1\/maintenance\/fault-rules/);
    assert.match(routes, /archive/);
  });

  it("wires predictive routes from form-425c bootstrap", () => {
    const form425c = fs.readFileSync(path.join(here, "../../src/compliance/form-425c.routes.ts"), "utf8");
    assert.match(form425c, /registerFaultRulesRoutes/);
    assert.match(form425c, /registerFaultHistoryRoutes/);
    assert.match(form425c, /registerAutoWoDraftsRoutes/);
  });
});

describe("predictive auto wo migration", () => {
  it("defines fault tables and work order origin columns", () => {
    const sql = fs.readFileSync(path.join(here, "../../../../db/migrations/0310_predictive_auto_wo.sql"), "utf8");
    assert.match(sql, /maintenance\.fault_code_severity_rules/);
    assert.match(sql, /maintenance\.samsara_fault_code_history/);
    assert.match(sql, /origin_fault_history_id/);
    assert.match(sql, /uq_fault_history_event/);
  });
});
