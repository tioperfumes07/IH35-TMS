import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("deadhead migration", () => {
  it("defines deadhead cache and load columns", () => {
    const sql = fs.readFileSync(path.join(here, "../../../../db/migrations/0308_deadhead_optimization.sql"), "utf8");
    assert.match(sql, /reports\.deadhead_cache/);
    assert.match(sql, /loaded_miles/);
    assert.match(sql, /deadhead_miles_to_pickup/);
    assert.match(sql, /deadhead_company_isolation/);
  });
});

describe("deadhead service and routes", () => {
  it("handles samsara manual and estimated calculation methods", () => {
    const src = fs.readFileSync(path.join(here, "../../src/reports/deadhead.service.ts"), "utf8");
    assert.match(src, /samsara/);
    assert.match(src, /manual/);
    assert.match(src, /estimated/);
    assert.match(src, /miles_deadhead/);
  });

  it("queries lane profitability cache for backhaul suggestions", () => {
    const src = fs.readFileSync(path.join(here, "../../src/reports/deadhead.service.ts"), "utf8");
    assert.match(src, /reports\.lane_profitability_cache/);
    assert.match(src, /getBackhaulSuggestions/);
  });

  it("registers deadhead report routes", () => {
    const routes = fs.readFileSync(path.join(here, "../../src/reports/deadhead.routes.ts"), "utf8");
    assert.match(routes, /\/api\/v1\/reports\/deadhead/);
    assert.match(routes, /\/api\/v1\/reports\/deadhead\/suggestions/);
  });

  it("schedules weekly refresh job and wires scheduler", () => {
    const job = fs.readFileSync(path.join(here, "../../src/reports/deadhead-refresh.job.ts"), "utf8");
    const scheduler = fs.readFileSync(path.join(here, "../../src/scheduler/jobs.index.ts"), "utf8");
    const form425c = fs.readFileSync(path.join(here, "../../src/compliance/form-425c.routes.ts"), "utf8");
    assert.match(job, /"0 3 \* \* 1"/);
    assert.match(job, /America\/Chicago/);
    assert.match(scheduler, /initializeDeadheadRefreshCron/);
    assert.match(form425c, /registerDeadheadRoutes/);
  });
});
