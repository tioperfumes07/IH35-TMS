import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn().mockResolvedValue(undefined),
}));

import { appendCrudAudit } from "../../audit/crud-audit.js";
import {
  LOAD_ID_RESERVATION_TTL_SECONDS,
  cancelLoadIdReservation,
  claimReservation,
  consumeLoadNumberReservation,
  reserveNextLoadId,
} from "../load-id-reservation.service.js";

describe("load-id-reservation.service", () => {
  beforeEach(() => {
    vi.mocked(appendCrudAudit).mockClear();
  });

  it("uses 60-second TTL on new reservations", async () => {
    let insertSql = "";
    const client = {
      async query<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<{ rows: T[] }> {
        if (sql.includes("UPDATE dispatch.load_id_reservations") && sql.includes("expired")) {
          return { rows: [] };
        }
        if (sql.includes("FROM mdata.loads") && sql.includes("next_seq")) {
          return { rows: [{ next_seq: 3 }] as T[] };
        }
        if (sql.includes("FROM dispatch.load_id_reservations") && sql.includes("ORDER BY reserved_at DESC")) {
          return { rows: [] };
        }
        if (sql.includes("FROM dispatch.load_id_reservations") && sql.includes("reserved_at::date")) {
          return { rows: [{ next_seq: 3 }] as T[] };
        }
        if (sql.includes("INSERT INTO dispatch.load_id_reservations")) {
          insertSql = sql;
          expect(values?.[3]).toBe(LOAD_ID_RESERVATION_TTL_SECONDS);
          return { rows: [{ id: "018bcd5c-e1a2-4b70-9b1c-7d9a2b111111", expires_at: "2026-05-13T12:00:01Z" }] as T[] };
        }
        return { rows: [] };
      },
    };

    const res = await reserveNextLoadId(client, {
      operatingCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
      reservedByUserId: "81f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6070",
    });

    expect(insertSql).toContain("interval");
    expect(res.ttlSeconds).toBe(60);
    expect(res.reservedUntilIso).toContain("2026-05-13");
  });

  it("renews only the exact company/user reservation instead of minting another number", async () => {
    const queries: Array<{ sql: string; values?: unknown[] }> = [];
    const client = {
      async query<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<{ rows: T[] }> {
        queries.push({ sql, values });
        if (sql.includes("SET expires_at = now()")) {
          return { rows: [{
            id: "018bcd5c-e1a2-4b70-9b1c-7d9a2b111111",
            reserved_load_number: "L-20260513-0003",
            expires_at: "2026-05-13T12:01:01Z",
          }] as T[] };
        }
        return { rows: [] };
      },
    };
    const result = await reserveNextLoadId(client, {
      operatingCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
      reservedByUserId: "11111111-1111-4111-8111-111111111111",
      reservationId: "018bcd5c-e1a2-4b70-9b1c-7d9a2b111111",
    });
    expect(result.loadNumber).toBe("L-20260513-0003");
    expect(queries.some(({ sql }) => sql.includes("INSERT INTO dispatch.load_id_reservations"))).toBe(false);
    expect(queries[0]?.sql).toContain("operating_company_id = $2::uuid");
    expect(queries[0]?.sql).toContain("reserved_by_user_id = $3::uuid");
    expect(queries[0]?.sql).toContain("status = 'reserved'");
    expect(queries[0]?.sql).toContain("expires_at > now() -");
  });

  it("claimReservation requires matching reserved_by user", async () => {
    const client = {
      async query<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<{ rows: T[] }> {
        if (sql.includes("UPDATE dispatch.load_id_reservations") && sql.includes("expired")) {
          return { rows: [] };
        }
        if (sql.includes("SELECT id, reserved_load_number")) {
          if (values?.[2] !== "11111111-1111-1111-1111-111111111111") {
            return { rows: [] };
          }
          return {
            rows: [
              {
                id: "018bcd5c-e1a2-4b70-9b1c-7d9a2b111111",
                reserved_load_number: "L-20260513-0003",
                reserved_by_user_id: "11111111-1111-1111-1111-111111111111",
              },
            ] as T[],
          };
        }
        return { rows: [] };
      },
    };

    const ok = await claimReservation(client, {
      operatingCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
      reservationId: "018bcd5c-e1a2-4b70-9b1c-7d9a2b111111",
      reservedByUserId: "11111111-1111-1111-1111-111111111111",
    });
    expect(ok?.reserved_load_number).toMatch(/^L-/);

    const missing = await claimReservation(client, {
      operatingCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
      reservationId: "018bcd5c-e1a2-4b70-9b1c-7d9a2b111111",
      reservedByUserId: "22222222-2222-2222-2222-222222222222",
    });
    expect(missing).toBeNull();
  });

  it("cancelLoadIdReservation updates active reservation for same user", async () => {
    const client = {
      async query<T = Record<string, unknown>>(sql: string): Promise<{ rows: T[] }> {
        if (sql.includes("UPDATE dispatch.load_id_reservations") && sql.includes("cancelled")) {
          return { rows: [{ id: "x" }] as T[] };
        }
        return { rows: [] };
      },
    };

    const released = await cancelLoadIdReservation(client, {
      operatingCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
      reservationId: "018bcd5c-e1a2-4b70-9b1c-7d9a2b111111",
      reservedByUserId: "11111111-1111-1111-1111-111111111111",
    });
    expect(released).toBe(true);
  });

  it("consumeLoadNumberReservation binds company/user and rejects a lost consume", async () => {
    const queries: Array<{ sql: string; values?: unknown[] }> = [];
    const successClient = {
      async query<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<{ rows: T[] }> {
        queries.push({ sql, values });
        return { rows: [{ id: "reservation" }] as T[] };
      },
    };
    await consumeLoadNumberReservation(successClient, {
      operatingCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
      reservationId: "018bcd5c-e1a2-4b70-9b1c-7d9a2b111111",
      reservedByUserId: "11111111-1111-4111-8111-111111111111",
      loadId: "33333333-3333-4333-8333-333333333333",
    });
    expect(queries[0]?.sql).toContain("operating_company_id = $3::uuid");
    expect(queries[0]?.sql).toContain("reserved_by_user_id = $4::uuid");
    expect(queries[0]?.sql).toContain("RETURNING id::text");

    const conflictClient = { async query<T = Record<string, unknown>>(): Promise<{ rows: T[] }> { return { rows: [] }; } };
    await expect(consumeLoadNumberReservation(conflictClient, {
      operatingCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
      reservationId: "018bcd5c-e1a2-4b70-9b1c-7d9a2b111111",
      reservedByUserId: "11111111-1111-4111-8111-111111111111",
      loadId: "33333333-3333-4333-8333-333333333333",
    })).rejects.toThrow("load_id_reservation_consume_conflict");
  });
});
