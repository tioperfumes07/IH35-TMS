import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { parseFastCardWarning } from "../../src/border-crossing/border-crossing-wizard.routes.js";
import { fetchCbpWaitTimesFromApi } from "../../src/border-crossing/cbp-wait-times.service.js";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("border crossing migration", () => {
  it("adds wizard columns, ports of entry, and CBP cache", () => {
    const sql = fs.readFileSync(path.join(here, "../../../../db/migrations/0313_border_crossing_wizard.sql"), "utf8");
    assert.match(sql, /planned_crossing_date/);
    assert.match(sql, /reference\.ports_of_entry/);
    assert.match(sql, /reference\.cbp_wait_times_cache/);
    assert.match(sql, /Laredo World Trade Bridge/);
    assert.match(sql, /customs_broker/);
  });
});

describe("border crossing wizard routes", () => {
  it("registers wizard, ports, wait-times, and pdf endpoints", () => {
    const routes = fs.readFileSync(
      path.join(here, "../../src/border-crossing/border-crossing-wizard.routes.ts"),
      "utf8"
    );
    assert.match(routes, /\/api\/v1\/border-crossing\/wizard/);
    assert.match(routes, /\/api\/v1\/border-crossing\/ports-of-entry/);
    assert.match(routes, /\/api\/v1\/border-crossing\/wait-times/);
    assert.match(routes, /\/api\/v1\/border-crossing\/:id\/emanifest\.pdf/);
    assert.match(routes, /fast_card_expiration/);
    assert.match(routes, /driver_fast_card_verified/);
  });

  it("warns when FAST card is expired", () => {
    const past = parseFastCardWarning("2020-01-01");
    assert.equal(past.verified, false);
    assert.match(past.warning ?? "", /expired/i);
    const future = parseFastCardWarning("2099-12-31");
    assert.equal(future.verified, true);
  });
});

describe("cbp wait times service", () => {
  it("handles API timeout gracefully", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error("timeout");
    };
    try {
      const rows = await fetchCbpWaitTimesFromApi("2304");
      assert.ok(Array.isArray(rows));
      assert.equal(rows[0]?.cbp_port_code, "2304");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("emanifest pdf renderer", () => {
  it("uses puppeteer page.pdf", () => {
    const src = fs.readFileSync(
      path.join(here, "../../src/border-crossing/emanifest-pdf-renderer.service.ts"),
      "utf8"
    );
    assert.match(src, /puppeteer/);
    assert.match(src, /page\.pdf/);
  });
});

describe("border crossing wiring", () => {
  it("schedules CBP refresh job and registers routes", () => {
    const job = fs.readFileSync(path.join(here, "../../src/border-crossing/cbp-wait-times-refresh.job.ts"), "utf8");
    const scheduler = fs.readFileSync(path.join(here, "../../src/scheduler/jobs.index.ts"), "utf8");
    const form425c = fs.readFileSync(path.join(here, "../../src/compliance/form-425c.routes.ts"), "utf8");
    assert.match(job, /America\/Chicago/);
    assert.match(scheduler, /initializeCbpWaitTimesRefreshCron/);
    assert.match(scheduler, /initializeLaneProfitabilityRefreshCron/);
    assert.match(form425c, /registerBorderCrossingWizardRoutes/);
  });
});
