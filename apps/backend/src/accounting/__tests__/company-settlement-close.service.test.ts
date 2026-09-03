import { describe, expect, it, vi } from "vitest";
import { closeCompanySettlementAlongsideDriverSettlement } from "../company-settlement-close.service.js";

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const DS_ID = "11111111-1111-1111-1111-111111111111";
const ACTOR = "u1";

function makeClient(handlers: Record<string, (sql: string, values?: unknown[]) => { rows: unknown[] }>) {
  return {
    query: vi.fn().mockImplementation(async (sql: string, values?: unknown[]) => {
      for (const [needle, handler] of Object.entries(handlers)) {
        if (sql.includes(needle)) return handler(sql, values);
      }
      throw new Error(`unexpected sql in test: ${sql}`);
    }),
  };
}

describe("closeCompanySettlementAlongsideDriverSettlement — 25-TASK #4", () => {
  it("throws driver_settlement_not_found when the driver settlement id does not resolve", async () => {
    const client = makeClient({
      "FROM driver_finance.driver_settlements": () => ({ rows: [] }),
    });
    await expect(
      closeCompanySettlementAlongsideDriverSettlement(client as never, {
        operatingCompanyId: OPCO,
        driverSettlementId: DS_ID,
        actorUserId: ACTOR,
      })
    ).rejects.toMatchObject({ code: "driver_settlement_not_found" });
  });

  it("no existing company settlement for the exact period — creates one via the generator, links, closes it", async () => {
    const inserted: unknown[][] = [];
    const client = makeClient({
      "FROM driver_finance.driver_settlements": () => ({
        rows: [{ period_start: "2026-08-01", period_end: "2026-08-07", status: "closed" }],
      }),
      "FROM accounting.company_settlement_driver_settlements": () => ({ rows: [] }),
      "FROM accounting.company_settlements\n": () => ({ rows: [] }), // find-by-period: none yet
      "next_company_settlement_display_id": () => ({ rows: [{ display_id: "CS-2026-0001" }] }),
      "INSERT INTO accounting.company_settlements": (_sql, values) => {
        inserted.push(values!);
        return { rows: [{ id: "cs1" }] };
      },
      "INSERT INTO accounting.company_settlement_driver_settlements": () => ({ rows: [] }),
      "SELECT status, voided_at::text FROM accounting.company_settlements": () => ({
        rows: [{ status: "open", voided_at: null }],
      }),
      "UPDATE accounting.company_settlements": () => ({
        rows: [{ id: "cs1", display_id: "CS-2026-0001", status: "closed" }],
      }),
    });

    const result = await closeCompanySettlementAlongsideDriverSettlement(client as never, {
      operatingCompanyId: OPCO,
      driverSettlementId: DS_ID,
      actorUserId: ACTOR,
    });

    expect(result).toEqual({
      company_settlement_id: "cs1",
      display_id: "CS-2026-0001",
      status: "closed",
      already_closed: false,
    });
    expect(inserted[0]).toEqual([OPCO, "CS-2026-0001", "2026-08-01", "2026-08-07", ACTOR]);
  });

  it("an existing OPEN company settlement for the exact period is reused, not duplicated", async () => {
    let createCalled = false;
    const client = makeClient({
      "FROM driver_finance.driver_settlements": () => ({
        rows: [{ period_start: "2026-08-01", period_end: "2026-08-07", status: "closed" }],
      }),
      "FROM accounting.company_settlement_driver_settlements": () => ({ rows: [] }),
      "FROM accounting.company_settlements\n": () => ({ rows: [{ id: "existing-cs" }] }),
      "next_company_settlement_display_id": () => {
        createCalled = true;
        return { rows: [{ display_id: "CS-2026-9999" }] };
      },
      "INSERT INTO accounting.company_settlement_driver_settlements": () => ({ rows: [] }),
      "SELECT status, voided_at::text FROM accounting.company_settlements": () => ({
        rows: [{ status: "open", voided_at: null }],
      }),
      "UPDATE accounting.company_settlements": () => ({
        rows: [{ id: "existing-cs", display_id: "CS-2026-0002", status: "closed" }],
      }),
    });

    const result = await closeCompanySettlementAlongsideDriverSettlement(client as never, {
      operatingCompanyId: OPCO,
      driverSettlementId: DS_ID,
      actorUserId: ACTOR,
    });

    expect(createCalled).toBe(false);
    expect(result.company_settlement_id).toBe("existing-cs");
  });

  it("already linked (idempotent re-entry) reuses the junction, never re-creates or re-links", async () => {
    let findOrCreateTouched = false;
    const client = makeClient({
      "FROM driver_finance.driver_settlements": () => ({
        rows: [{ period_start: "2026-08-01", period_end: "2026-08-07", status: "closed" }],
      }),
      "FROM accounting.company_settlement_driver_settlements": () => ({
        rows: [{ company_settlement_id: "already-linked-cs" }],
      }),
      "FROM accounting.company_settlements\n": () => {
        findOrCreateTouched = true;
        return { rows: [] };
      },
      "SELECT status, voided_at::text FROM accounting.company_settlements": () => ({
        rows: [{ status: "closed", voided_at: null }],
      }),
      "UPDATE accounting.company_settlements": () => ({
        rows: [{ id: "already-linked-cs", display_id: "CS-2026-0003", status: "closed" }],
      }),
    });

    const result = await closeCompanySettlementAlongsideDriverSettlement(client as never, {
      operatingCompanyId: OPCO,
      driverSettlementId: DS_ID,
      actorUserId: ACTOR,
    });

    expect(findOrCreateTouched).toBe(false);
    expect(result.company_settlement_id).toBe("already-linked-cs");
    expect(result.already_closed).toBe(true);
  });

  it("void-not-delete: refuses to close a voided company settlement", async () => {
    const client = makeClient({
      "FROM driver_finance.driver_settlements": () => ({
        rows: [{ period_start: "2026-08-01", period_end: "2026-08-07", status: "closed" }],
      }),
      "FROM accounting.company_settlement_driver_settlements": () => ({
        rows: [{ company_settlement_id: "voided-cs" }],
      }),
      "SELECT status, voided_at::text FROM accounting.company_settlements": () => ({
        rows: [{ status: "void", voided_at: "2026-08-10T00:00:00.000Z" }],
      }),
    });

    await expect(
      closeCompanySettlementAlongsideDriverSettlement(client as never, {
        operatingCompanyId: OPCO,
        driverSettlementId: DS_ID,
        actorUserId: ACTOR,
      })
    ).rejects.toMatchObject({ code: "company_settlement_voided" });
  });
});
