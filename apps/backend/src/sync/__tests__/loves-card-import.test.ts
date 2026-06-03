import { describe, expect, it, vi } from "vitest";
import {
  LOVES_CARD_IMPORT_SOURCE,
  importLovesRowsForCompany,
  parseLovesCsv,
  resetLovesCardImportStateForTests,
  runLovesCardImportTick,
} from "../loves-card-import.js";

describe("parseLovesCsv", () => {
  it("parses Loves CSV happy path", () => {
    const csv = [
      "station_name,station_address,price_per_gallon,city,state",
      "Love's #123,100 Main St,3.459,Dallas,TX",
      "Love's #456,200 Oak Ave,3.299,Austin,TX",
    ].join("\n");

    const parsed = parseLovesCsv(csv);
    expect(parsed.dead_letters).toHaveLength(0);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toMatchObject({
      station_name: "Love's #123",
      station_address: "100 Main St",
      price_per_gallon: 3.459,
      city: "Dallas",
      state: "TX",
    });
  });

  it("dead-letters bad rows without crashing", async () => {
    const csv = [
      "station_name,station_address,price_per_gallon",
      "Good Station,123 Road,3.25",
      ",missing name,3.10",
      "Bad Price,456 Road,not-a-number",
    ].join("\n");

    const parsed = parseLovesCsv(csv);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.dead_letters).toHaveLength(2);

    const queries: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql);
        if (sql.includes("UPDATE fuel.loves_prices_daily")) return { rowCount: 0 };
        if (sql.includes("INSERT INTO fuel.loves_prices_daily")) return { rowCount: 1 };
        if (sql.includes("audit.append_event")) return { rows: [] };
        return { rows: [] };
      }),
    };

    const counts = await importLovesRowsForCompany(
      client,
      "00000000-0000-4000-8000-000000000001",
      parsed
    );
    expect(counts.rows_added).toBe(1);
    expect(counts.dead_letters).toBe(2);
    expect(queries.some((sql) => sql.includes("audit.append_event"))).toBe(true);
  });
});

describe("runLovesCardImportTick", () => {
  it("returns disabled when no CSV source configured", async () => {
    resetLovesCardImportStateForTests();
    const result = await runLovesCardImportTick({
      loadCsvImpl: async () => null,
    });
    expect(result.status).toBe("disabled");
  });

  it("imports rows for active companies when CSV is present", async () => {
    resetLovesCardImportStateForTests();
    const csv = "station_name,station_address,price_per_gallon\nStation A,1 Main,3.21\n";
    const result = await runLovesCardImportTick({
      loadCsvImpl: async () => csv,
      listCompanyIdsImpl: async () => ["00000000-0000-4000-8000-000000000001"],
      withLuciaBypassImpl: async (fn) =>
        fn({
          query: vi.fn(async (sql: string) => {
            if (sql.includes("to_regclass")) return { rows: [{ ok: true }] };
            if (sql.includes("set_config")) return { rows: [] };
            if (sql.includes("UPDATE fuel.loves_prices_daily")) return { rowCount: 0 };
            if (sql.includes("INSERT INTO fuel.loves_prices_daily")) {
              expect(sql).toContain(LOVES_CARD_IMPORT_SOURCE);
              return { rowCount: 1 };
            }
            if (sql.includes("audit.append_event")) return { rows: [] };
            return { rows: [] };
          }),
        }),
    });

    expect(result.status).toBe("ok");
    expect(result.company_count).toBe(1);
  });
});
