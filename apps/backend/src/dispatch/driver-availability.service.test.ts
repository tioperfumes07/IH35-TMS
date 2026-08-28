import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { canAssignLoadToDriver } from "./driver-availability.service.js";

describe("canAssignLoadToDriver", () => {
  it("DISP-F6222: HOS query admits home-company OR an active mdata.driver_company_authorizations row, not company equality alone", () => {
    // The mock db in the tests below returns canned rows by call order and never inspects the SQL
    // text, so it cannot catch a regression back to `operating_company_id = $2` alone — assert the
    // real source directly, mirroring the pattern used across the DRV-F61xx/F62xx sweep.
    const src = readFileSync(fileURLToPath(new URL("./driver-availability.service.ts", import.meta.url)), "utf8");
    expect(src).toMatch(
      /dispatch_hos_dca\.driver_id = d\.id[\s\S]{0,180}dispatch_hos_dca\.company_id = \$2::uuid[\s\S]{0,180}dispatch_hos_dca\.is_authorized = true[\s\S]{0,180}dispatch_hos_dca\.deactivated_at IS NULL/
    );
  });

  it("still blocks an HOS-violating driver (the check the DISP-F6222 fix must not weaken)", async () => {
    const db = {
      async query<T = Record<string, unknown>>(_sql: string, _values?: unknown[]): Promise<{ rows: T[] }> {
        if (_sql.includes("drivers_with_hos_status")) {
          return {
            rows: [
              { full_name: "Shared Driver", display_id: "D-042", is_in_violation: true },
            ] as T[],
          };
        }
        return { rows: [] };
      },
    };

    const result = await canAssignLoadToDriver(
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
      db
    );

    expect(result).toEqual({
      ok: false,
      code: "E_DRIVER_HOS_VIOLATION",
      blocker: "Shared Driver is in HOS violation",
    });
  });

  it("returns E_DRIVER_NOT_FOUND when the selected-company driver identity is absent", async () => {
    const db = {
      async query<T = Record<string, unknown>>(_sql: string, _values?: unknown[]): Promise<{ rows: T[] }> {
        return { rows: [] };
      },
    };

    const result = await canAssignLoadToDriver(
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
      db
    );

    expect(result).toEqual({
      ok: false,
      code: "E_DRIVER_NOT_FOUND",
      blocker: "Driver was not found for this operating company",
    });
  });

  it("returns ok=true when an authorized driver has no HOS feed and no active work order", async () => {
    let call = 0;
    const db = {
      async query<T = Record<string, unknown>>(): Promise<{ rows: T[] }> {
        call += 1;
        if (call === 1) return { rows: [{ driver_id: "driver-1", is_in_violation: false }] as T[] };
        return { rows: [] };
      },
    };
    const result = await canAssignLoadToDriver(
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
      db
    );
    expect(result).toEqual({ ok: true });
  });

  it("returns blocker when an active work order exists", async () => {
    let call = 0;
    const db = {
      async query<T = Record<string, unknown>>(_sql: string, _values?: unknown[]): Promise<{ rows: T[] }> {
        call += 1;
        if (call === 1) return { rows: [{ driver_id: "driver-1", is_in_violation: false }] as T[] };
        return {
          rows: [
            {
              id: "WO-123",
              asset_id: "UNIT-7",
              status: "open",
              // FAIL-U1: the row now carries operator-readable labels alongside the ids.
              display_id: "WO-T120-RS-08-08-2026-0002-PEND0",
              unit_number: "T120",
            },
          ] as T[],
        };
      },
    };

    const result = await canAssignLoadToDriver(
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
      db
    );

    expect(result).toEqual({
      ok: false,
      code: "E_DRIVER_REPAIR_BLOCK",
      // FAIL-U1: names the work order a dispatcher can look up, not its uuid.
      blocker: "Driver's truck is in repair (WO WO-T120-RS-08-08-2026-0002-PEND0)",
      work_order_id: "WO-123",
      asset_id: "UNIT-7",
      work_order_display_id: "WO-T120-RS-08-08-2026-0002-PEND0",
      asset_label: "T120",
    });
  });

  it("treats completed work order as assignable", async () => {
    let call = 0;
    const db = {
      async query<T = Record<string, unknown>>(_sql: string, _values?: unknown[]): Promise<{ rows: T[] }> {
        call += 1;
        if (call === 1) return { rows: [{ driver_id: "driver-1", is_in_violation: false }] as T[] };
        return {
          rows: [
            {
              id: "WO-999",
              asset_id: "UNIT-9",
              status: "completed",
            },
          ] as T[],
        };
      },
    };

    const result = await canAssignLoadToDriver(
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
      db
    );

    expect(result).toEqual({ ok: true });
  });

  it("enforces tenant scope in the canonical identity query", async () => {
    const capturedTenants: string[] = [];
    const db = {
      async query<T = Record<string, unknown>>(_sql: string, values?: unknown[]): Promise<{ rows: T[] }> {
        const tenant = String(values?.[1] ?? "");
        capturedTenants.push(tenant);
        if (_sql.includes("FROM mdata.drivers d")) return { rows: [{ driver_id: "driver-1", is_in_violation: false }] as T[] };
        return { rows: [] };
      },
    };

    const tenantA = await canAssignLoadToDriver(
      "11111111-1111-1111-1111-111111111111",
      "tenant-a",
      db
    );
    const tenantB = await canAssignLoadToDriver(
      "11111111-1111-1111-1111-111111111111",
      "tenant-b",
      db
    );

    expect(tenantA).toEqual({ ok: true });
    expect(tenantB).toEqual({ ok: true });
    expect(capturedTenants).toContain("tenant-a");
    expect(capturedTenants).toContain("tenant-b");
  });
});
