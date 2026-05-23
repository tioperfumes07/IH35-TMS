import { describe, expect, it, vi } from "vitest";
import { processDtcAutoWorkOrderEvent } from "../dtc-auto-work-order.service.js";

describe("dtc auto work order tenant isolation", () => {
  it("reads and writes by operating_company_id", async () => {
    const calls: Array<{ sql: string; values: unknown[] | undefined }> = [];
    const client = {
      query: vi.fn(async (sql: string, values?: unknown[]) => {
        calls.push({ sql, values });
        if (sql.includes("FROM maintenance.work_orders w")) return { rows: [] };
        if (sql.includes("FROM telematics.vehicle_driver_assignments")) return { rows: [] };
        if (sql.includes("FROM maintenance.next_wo_display_id")) return { rows: [{ display_id: "WO-123", sequence: 123 }] };
        if (sql.includes("INSERT INTO maintenance.work_orders")) return { rows: [] };
        return { rows: [] };
      }),
    };

    await processDtcAutoWorkOrderEvent(client as never, {
      operating_company_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      unit_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      occurred_at: "2026-05-24T00:00:00.000Z",
      dtc_code: "P0700",
      description: "Transmission control system",
    });

    const dedupe = calls.find((c) => c.sql.includes("FROM maintenance.work_orders w"));
    const insert = calls.find((c) => c.sql.includes("INSERT INTO maintenance.work_orders"));
    expect(dedupe?.sql).toContain("w.operating_company_id = $1::uuid");
    expect(insert?.sql).toContain("operating_company_id");
    expect(dedupe?.values?.[0]).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    expect(insert?.values?.[0]).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  });
});
