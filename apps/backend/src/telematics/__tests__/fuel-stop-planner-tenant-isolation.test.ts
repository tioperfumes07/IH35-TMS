import { describe, expect, it, vi } from "vitest";
import { recommendFuelStopsForRecommendation } from "../fuel-stop-planner.service.js";

describe("fuel stop planner tenant isolation", () => {
  it("filters route context and stop lookup by operating_company_id", async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const client = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        if (sql.includes("FROM fuel.route_recommendations r")) {
          return {
            rows: [
              {
                load_id: "11111111-1111-1111-1111-111111111111",
                driver_id: null,
                current_fuel_gallons: 80,
                fuel_capacity_gallons: 120,
                current_mpg: 6.5,
              },
            ],
          };
        }
        if (sql.includes("FROM mdata.load_stops s")) {
          return { rows: [] };
        }
        return { rows: [] };
      }),
    };

    await recommendFuelStopsForRecommendation(client, {
      operating_company_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      recommendation_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    });

    const routeContext = calls.find((c) => c.sql.includes("FROM fuel.route_recommendations r"));
    expect(routeContext?.params[1]).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");

    const stops = calls.find((c) => c.sql.includes("FROM mdata.load_stops s"));
    expect(stops?.params[1]).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  });
});
