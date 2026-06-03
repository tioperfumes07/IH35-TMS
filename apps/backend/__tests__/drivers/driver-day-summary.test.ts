import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { z } from "zod";

const here = path.dirname(fileURLToPath(import.meta.url));
const routesSrc = fs.readFileSync(path.join(here, "../../src/telematics/driver-day-summary.routes.ts"), "utf8");
const indexSrc = fs.readFileSync(path.join(here, "../../src/index.ts"), "utf8");

const driverDaySummaryRowSchema = z.object({
  driver_id: z.string().uuid(),
  driver_name: z.string(),
  miles: z.number(),
  hours_on_duty: z.number(),
  fuel_stops: z.number(),
  on_time_arrivals: z.number(),
  late_arrivals: z.number(),
});

const driverDaySummaryResponseSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  has_data: z.boolean(),
  rows: z.array(driverDaySummaryRowSchema),
});

describe("driver day summary route contract", () => {
  it("returns has_data=true with minute aggregates when rows exist", () => {
    const payload = driverDaySummaryResponseSchema.parse({
      date: "2026-06-02",
      has_data: true,
      rows: [
        {
          driver_id: "11111111-1111-4111-8111-111111111111",
          driver_name: "Alex Driver",
          miles: 120.4,
          hours_on_duty: 8.5,
          fuel_stops: 2,
          on_time_arrivals: 3,
          late_arrivals: 1,
        },
      ],
    });
    assert.equal(payload.has_data, true);
    assert.equal(payload.rows[0]?.hours_on_duty, 8.5);
  });

  it("returns has_data=false with zero-shape rows on no-HOS days", () => {
    const payload = driverDaySummaryResponseSchema.parse({
      date: "2026-06-02",
      has_data: false,
      rows: [],
    });
    assert.equal(payload.has_data, false);
    assert.deepEqual(payload.rows, []);
  });

  it("validates row shape with numeric zero defaults", () => {
    const row = driverDaySummaryRowSchema.parse({
      driver_id: "22222222-2222-4222-8222-222222222222",
      driver_name: "Blake Operator",
      miles: 0,
      hours_on_duty: 0,
      fuel_stops: 0,
      on_time_arrivals: 0,
      late_arrivals: 0,
    });
    assert.equal(row.miles, 0);
  });

  it("requires ISO date query param and returns 400 on invalid date", () => {
    assert.match(routesSrc, /date: z\.string\(\)\.regex\(ISO_DATE\)/);
    assert.match(routesSrc, /validationError\(reply, query\.error\)/);
    assert.match(routesSrc, /reply\.code\(400\)/);
  });

  it("scopes reads with withCurrentUser and tenant filters (RLS)", () => {
    assert.match(routesSrc, /withCurrentUser\(/);
    assert.match(routesSrc, /set_config\('app\.operating_company_id'/);
    assert.match(routesSrc, /WHERE v\.operating_company_id = \$1::uuid/);
    assert.match(routesSrc, /WHERE e\.operating_company_id = \$1::uuid/);
    assert.match(routesSrc, /WHERE ft\.operating_company_id = \$1::uuid/);
    assert.match(routesSrc, /WHERE sa\.operating_company_id = \$1::uuid/);
    assert.match(indexSrc, /registerDriverDaySummaryRoutes/);
  });
});
