import { describe, expect, it, vi } from "vitest";
import { AnomalyDetectorService } from "./anomaly-detector.service.js";

function makeService(queryImpl: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>) {
  return new AnomalyDetectorService({
    query: vi.fn(queryImpl),
  });
}

describe("AnomalyDetectorService", () => {
  it("detects orphaned bills and inserts anomaly rows", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM accounting.bills")) {
        return {
          rows: [
            {
              bill_id: "11111111-1111-4111-8111-111111111111",
              bill_number: "B-100",
              amount_cents: 12000,
            },
          ],
        };
      }
      if (sql.includes("FROM mdata.drivers")) return { rows: [] };
      if (sql.includes("FROM maintenance.pm_alerts")) return { rows: [] };
      if (sql.includes("INSERT INTO integrity.anomalies")) return { rows: [], rowCount: 1 };
      return { rows: [] };
    });

    const service = new AnomalyDetectorService({ query });
    const result = await service.detectAll("22222222-2222-4222-8222-222222222222");

    expect(result).toEqual({ scanned: 1, inserted: 1 });
    const insertCall = query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO integrity.anomalies"));
    expect(insertCall?.[1]).toEqual(
      expect.arrayContaining([
        expect.any(String),
        "22222222-2222-4222-8222-222222222222",
        "orphaned-bill",
      ])
    );
  });

  it("detects active drivers without valid medical cards", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM accounting.bills")) return { rows: [] };
      if (sql.includes("FROM mdata.drivers")) {
        return {
          rows: [
            {
              driver_id: "33333333-3333-4333-8333-333333333333",
              first_name: "Mia",
              last_name: "Driver",
            },
          ],
        };
      }
      if (sql.includes("FROM maintenance.pm_alerts")) return { rows: [] };
      if (sql.includes("INSERT INTO integrity.anomalies")) return { rows: [], rowCount: 1 };
      return { rows: [] };
    });

    const service = new AnomalyDetectorService({ query });
    const result = await service.detectAll("22222222-2222-4222-8222-222222222222");

    expect(result.inserted).toBe(1);
    expect(result.scanned).toBe(1);
    const insertValues = query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO integrity.anomalies"))?.[1] as unknown[];
    expect(insertValues[2]).toBe("driver-without-medcard");
    expect(insertValues[3]).toBe("high");
  });

  it("detects units with overdue preventive maintenance", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM accounting.bills")) return { rows: [] };
      if (sql.includes("FROM mdata.drivers")) return { rows: [] };
      if (sql.includes("FROM maintenance.pm_alerts")) {
        return {
          rows: [
            {
              unit_id: "44444444-4444-4444-8444-444444444444",
              unit_number: "TRK-22",
              triggered_at: "2026-05-01T00:00:00.000Z",
              pm_schedule_id: "55555555-5555-4555-8555-555555555555",
            },
          ],
        };
      }
      if (sql.includes("INSERT INTO integrity.anomalies")) return { rows: [], rowCount: 1 };
      return { rows: [] };
    });

    const service = new AnomalyDetectorService({ query });
    const result = await service.detectAll("22222222-2222-4222-8222-222222222222");

    expect(result.inserted).toBe(1);
    const insertValues = query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO integrity.anomalies"))?.[1] as unknown[];
    expect(insertValues[2]).toBe("unit-overdue-pm");
    expect(insertValues[4]).toBe("unit");
  });

  it("is idempotent when same anomaly already exists as new", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM accounting.bills")) {
        return {
          rows: [{ bill_id: "77777777-7777-4777-8777-777777777777", bill_number: "B-777", amount_cents: 1000 }],
        };
      }
      if (sql.includes("FROM mdata.drivers")) return { rows: [] };
      if (sql.includes("FROM maintenance.pm_alerts")) return { rows: [] };
      if (sql.includes("INSERT INTO integrity.anomalies")) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [] };
    });

    const service = new AnomalyDetectorService({ query });
    const result = await service.detectAll("22222222-2222-4222-8222-222222222222");

    expect(result).toEqual({ scanned: 1, inserted: 0 });
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes("existing.status = 'new'"))
    ).toBe(true);
  });

  it("runs all detectors in one pass", async () => {
    const service = makeService(async (sql: string) => {
      if (sql.includes("FROM accounting.bills")) return { rows: [] };
      if (sql.includes("FROM mdata.drivers")) return { rows: [] };
      if (sql.includes("FROM maintenance.pm_alerts")) return { rows: [] };
      if (sql.includes("INSERT INTO integrity.anomalies")) return { rows: [], rowCount: 1 };
      return { rows: [] };
    });

    const result = await service.detectAll("22222222-2222-4222-8222-222222222222");
    expect(result).toEqual({ scanned: 0, inserted: 0 });
  });
});
