import { describe, expect, it } from "vitest";
import { getHosDaily } from "../hos-tracker.service.js";

const OCI = "11111111-1111-4111-8111-111111111111";
const DRIVER = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-06-19T20:00:00.000Z"); // Laredo dayEnd = 2026-06-20T05:00Z (next midnight)

// GUARD: roster_cyc != board_cyc by ~303min = the dayEnd−now gap (hours to Laredo midnight). The roster fetched from
// dayEnd−8d (too late) and missed on-duty in [asOf−8d, dayEnd−8d], over-stating cycle. The fetch MUST anchor to
// asOf−8d — the SAME window computeHosClocks uses for the 70h cycle and the SAME the board (now()−8d) now uses.
describe("getHosDaily fetch window consistency", () => {
  it("fetches events from asOf − 8 days (NOT dayEnd − 8 days), matching the board + the cycle window", async () => {
    let capturedFrom: string | null = null;
    let capturedTo: string | null = null;
    const client = {
      query: async (sql: string, params?: unknown[]) => {
        if (sql.includes("FROM hos.duty_status_events")) {
          capturedFrom = String((params ?? [])[2]);
          capturedTo = String((params ?? [])[3]);
          return { rows: [] };
        }
        return { rows: [] };
      },
    };
    await getHosDaily(client, OCI, DRIVER, "2026-06-19", NOW);

    expect(capturedFrom).not.toBeNull();
    const eightDaysFromAsOf = new Date(NOW.getTime() - 8 * 24 * 3600_000).toISOString();
    expect(capturedFrom).toBe(eightDaysFromAsOf); // asOf − 8d, the cycle window — NOT dayEnd − 8d
    expect(new Date(capturedTo as unknown as string).getTime()).toBe(NOW.getTime()); // up to asOf
  });
});
