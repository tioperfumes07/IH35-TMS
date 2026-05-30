import { describe, expect, it } from "vitest";
import { canAssignLoadToDriver } from "./driver-availability.service.js";

describe("canAssignLoadToDriver", () => {
  it("returns ok=true when no active work order exists", async () => {
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

    expect(result).toEqual({ ok: true });
  });

  it("returns blocker when an active work order exists", async () => {
    const db = {
      async query<T = Record<string, unknown>>(_sql: string, _values?: unknown[]): Promise<{ rows: T[] }> {
        return {
          rows: [
            {
              id: "WO-123",
              asset_id: "UNIT-7",
              status: "open",
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
      blocker: "Driver's truck is in repair (WO WO-123)",
      work_order_id: "WO-123",
      asset_id: "UNIT-7",
    });
  });

  it("treats completed work order as assignable", async () => {
    const db = {
      async query<T = Record<string, unknown>>(_sql: string, _values?: unknown[]): Promise<{ rows: T[] }> {
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

  it("enforces tenant scope in query params", async () => {
    let capturedTenant: string | null = null;
    const db = {
      async query<T = Record<string, unknown>>(_sql: string, values?: unknown[]): Promise<{ rows: T[] }> {
        capturedTenant = String(values?.[1] ?? "");
        if (capturedTenant === "tenant-a") {
          return {
            rows: [
              {
                id: "WO-TENANT-A",
                asset_id: "UNIT-A",
                status: "in_progress",
              },
            ] as T[],
          };
        }
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

    expect(tenantA.ok).toBe(false);
    expect(tenantB).toEqual({ ok: true });
    expect(capturedTenant).toBe("tenant-b");
  });
});
