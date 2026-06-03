import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildReeferSummary, displayTypeForTrailer, fetchUnifiedFleetList } from "./units-unified-list.service.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const unitsRoutes = fs.readFileSync(path.join(here, "units.routes.ts"), "utf8");

describe("units unified list", () => {
  it("GET /api/v1/mdata/units supports ?include=trailers with kind discriminator", () => {
    expect(unitsRoutes).toMatch(/include === "trailers"/);
    expect(unitsRoutes).toMatch(/fetchUnifiedFleetList/);
    expect(unitsRoutes).toMatch(/include: z\.enum\(\["trailers"\]\)/);
  });

  it("without include param returns truck-only query path", () => {
    expect(unitsRoutes).toMatch(/FROM mdata\.units/);
    expect(unitsRoutes).toMatch(/return \{ units \}/);
  });

  it("reefer_summary populated when reefer_brand/year present", () => {
    expect(buildReeferSummary({ equipment_type: "Reefer", reefer_year: 2020, reefer_brand: "Carrier" })).toBe(
      "Reefer (2020 Carrier)"
    );
    expect(buildReeferSummary({ equipment_type: "Reefer" })).toBe("Reefer");
    expect(displayTypeForTrailer({ equipment_type: "DryVan" })).toBe("Dry Van");
  });

  it("fetchUnifiedFleetList merges trucks and trailers with tenant filters", async () => {
    const queries: string[] = [];
    const client = {
      query: async (sql: string) => {
        queries.push(sql);
        if (sql.includes("mdata.units")) {
          return {
            rows: [
              {
                id: "truck-1",
                unit_number: "101",
                vin: "V1",
                make: "Freightliner",
                model: "Cascadia",
                year: 2022,
                status: "InService",
                is_oos: false,
                vehicle_type: "Sleeper",
              },
            ],
          };
        }
        return {
          rows: [
            {
              id: "trailer-1",
              equipment_number: "T-55",
              vin: "V2",
              equipment_type: "Reefer",
              reefer_year: 2019,
              reefer_brand: "Thermo King",
              status: "InService",
            },
          ],
        };
      },
    };

    const rows = await fetchUnifiedFleetList(client, {
      limit: 500,
      offset: 0,
      operating_company_id: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
    });

    expect(queries.some((sql) => sql.includes("owner_company_id"))).toBe(true);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === "truck-1")?.kind).toBe("truck");
    expect(rows.find((r) => r.id === "trailer-1")?.type).toBe("Reefer (2019 Thermo King)");
  });
});
