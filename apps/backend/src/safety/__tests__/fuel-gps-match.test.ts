import { describe, expect, it, vi } from "vitest";
import { runFuelGpsMatchBatch } from "../fuel-gps-match.service.js";

describe("fuel gps match", () => {
  it("matches three fuel transactions to nearby gps rows", async () => {
    const upserts: Array<{ txn: string; confidence: string }> = [];
    const query = vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes("FROM banking.bank_transactions bt")) {
        return {
          rows: [
            { id: "t1", operating_company_id: "oc1", matched_load_id: null, reference_ts: "2026-05-23T10:00:00.000Z" },
            { id: "t2", operating_company_id: "oc1", matched_load_id: null, reference_ts: "2026-05-23T10:10:00.000Z" },
            { id: "t3", operating_company_id: "oc1", matched_load_id: null, reference_ts: "2026-05-23T10:20:00.000Z" },
          ],
        };
      }
      if (sql.includes("FROM telematics.vehicle_locations v")) {
        const ts = String(values?.[1] ?? "");
        if (ts.includes("10:00")) return { rows: [{ unit_id: "u1", lat: 30.2, lng: -97.7, captured_at: ts, seconds_diff: 20 }] };
        if (ts.includes("10:10")) return { rows: [{ unit_id: "u2", lat: 30.3, lng: -97.8, captured_at: ts, seconds_diff: 180 }] };
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO safety.fuel_gps_matches")) {
        upserts.push({ txn: String(values?.[1] ?? ""), confidence: String(values?.[4] ?? "no_match") });
        return { rows: [], rowCount: 1 };
      }
      return { rows: [] };
    });

    const matched = await runFuelGpsMatchBatch({ query } as never, "oc1", 10);
    expect(matched).toBe(3);
    expect(upserts).toEqual(
      expect.arrayContaining([
        { txn: "t1", confidence: "high" },
        { txn: "t3", confidence: "no_match" },
      ])
    );
  });
});
