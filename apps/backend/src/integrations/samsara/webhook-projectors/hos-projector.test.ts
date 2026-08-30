import { describe, expect, it, vi } from "vitest";
import { projectHosEvent } from "./hos-projector.js";

describe("HOS webhook projector", () => {
  it("resolves a selected-company authorized shared driver before writing HOS", async () => {
    const queries: string[] = [];
    const query = vi.fn(async (sql: string) => {
      queries.push(sql);
      if (sql.includes("FROM mdata.drivers d")) return { rows: [{ id: "driver-local" }] };
      if (sql.includes("FROM integrations.samsara_vehicles")) return { rows: [{ local_unit_id: "unit-local" }] };
      return { rows: [] };
    });

    const result = await projectHosEvent(
      { query },
      {
        id: "evt-hos-1",
        operating_company_id: "11111111-1111-1111-1111-111111111111",
        event_type: "hos.updated",
        samsara_event_id: "sam-hos-1",
        signature_valid: true,
        payload: {
          data: {
            dutyStatus: "driving",
            startedAt: "2026-08-23T12:00:00.000Z",
            driver: { id: "samsara-driver" },
            vehicle: { id: "samsara-unit" },
          },
        },
        received_at: "2026-08-23T12:00:01.000Z",
        projection_attempts: 0,
      }
    );

    expect(result).toEqual({ success: true });
    const driverSql = queries.find((sql) => sql.includes("FROM mdata.drivers d")) ?? "";
    expect(driverSql).toContain("FROM mdata.driver_company_authorizations hos_projector_dca");
    expect(driverSql).toContain("hos_projector_dca.company_id = $1::uuid");
    expect(driverSql).toContain("hos_projector_dca.is_authorized = true");
    expect(driverSql).toContain("hos_projector_dca.deactivated_at IS NULL");
    expect(query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO hos.duty_status_events"), [
      "11111111-1111-1111-1111-111111111111",
      "driver-local",
      "unit-local",
      "driving",
      "2026-08-23T12:00:00.000Z",
      null,
      null,
      null,
    ]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("UPDATE mdata.drivers d"), [
      "11111111-1111-1111-1111-111111111111",
      "driver-local",
      "2026-08-23T12:00:00.000Z",
    ]);
    const loginSql = queries.find((sql) => sql.includes("SET last_samsara_login_at")) ?? "";
    expect(loginSql).toContain("samsara_login_dca.company_id = $1::uuid");
    expect(loginSql).toContain("d.last_samsara_login_at < $3::timestamptz");
  });
});
