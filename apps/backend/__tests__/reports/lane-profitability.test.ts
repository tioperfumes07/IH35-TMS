import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("lane profitability migration", () => {
  it("defines cache table, RLS, and monthly materialized view", () => {
    const sql = fs.readFileSync(
      path.join(here, "../../../../db/migrations/0311_lane_profitability_heatmap.sql"),
      "utf8"
    );
    assert.match(sql, /reports\.lane_profitability_cache/);
    assert.match(sql, /reports\.lane_metrics_monthly/);
    assert.match(sql, /lane_profit_company_isolation/);
    assert.match(sql, /refresh_lane_metrics_monthly/);
  });
});

describe("lane profitability service and routes", () => {
  it("aggregates by lane with profit-per-truck join pattern", () => {
    const service = fs.readFileSync(path.join(here, "../../src/reports/lane-profitability.service.ts"), "utf8");
    const routes = fs.readFileSync(path.join(here, "../../src/reports/lane-profitability.routes.ts"), "utf8");
    assert.match(service, /driver_finance\.driver_bills/);
    assert.match(service, /maintenance\.work_orders/);
    assert.match(service, /fuel\.fuel_transactions/);
    assert.match(service, /refreshLaneProfitabilityCache/);
    assert.match(routes, /\/api\/v1\/reports\/lane-profitability/);
    assert.match(routes, /\/api\/v1\/reports\/lane-profitability\/loads/);
  });

  it("schedules nightly refresh job and wires scheduler", () => {
    const job = fs.readFileSync(path.join(here, "../../src/reports/lane-profitability-refresh.job.ts"), "utf8");
    const scheduler = fs.readFileSync(path.join(here, "../../src/scheduler/jobs.index.ts"), "utf8");
    assert.match(job, /"0 2 \* \* \*"/);
    assert.match(job, /America\/Chicago/);
    assert.match(scheduler, /initializeLaneProfitabilityRefreshCron/);
  });
});
