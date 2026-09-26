import { describe, expect, it, vi } from "vitest";
import { closeCompanySettlementAlongsideDriverSettlement } from "../company-settlement-close.service.js";

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const DS_ID = "11111111-1111-1111-1111-111111111111";
const ACTOR = "u1";

function makeClient(handlers: Record<string, (sql: string, values?: unknown[]) => { rows: unknown[] }>) {
  return {
    query: vi.fn().mockImplementation(async (sql: string, values?: unknown[]) => {
      for (const [needle, handler] of Object.entries(handlers).sort(([a], [b]) => Number(b.startsWith("UPDATE")) - Number(a.startsWith("UPDATE")))) {
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

  it("R-200: creates ONE company settlement for the driver settlement, numbered by the driver settlement (AlwaysTrack), never minted", async () => {
    const inserted: unknown[][] = [];
    let minted = false;
    const client = makeClient({
      "COALESCE(source_document_ref, display_id)": () => ({ rows: [{ n: "5805" }] }),
      "FROM driver_finance.driver_settlements": () => ({
        rows: [{ period_start: "2026-09-08", period_end: "2026-09-14", status: "closed" }],
      }),
      "FROM accounting.company_settlement_driver_settlements": () => ({ rows: [] }),
      "AND display_id = $2 AND voided_at IS NULL": () => ({ rows: [] }),
      "next_company_settlement_display_id": () => {
        minted = true;
        return { rows: [{ display_id: "CS-2026-0001" }] };
      },
      "INSERT INTO accounting.company_settlements": (_sql, values) => {
        inserted.push(values!);
        return { rows: [{ id: "cs1" }] };
      },
      "INSERT INTO accounting.company_settlement_driver_settlements": () => ({ rows: [] }),
      "SELECT status, voided_at::text FROM accounting.company_settlements": () => ({
        rows: [{ status: "open", voided_at: null }],
      }),
      "UPDATE accounting.company_settlements": () => ({
        rows: [{ id: "cs1", display_id: "5805", status: "closed" }],
      }),
    });

    const result = await closeCompanySettlementAlongsideDriverSettlement(client as never, {
      operatingCompanyId: OPCO,
      driverSettlementId: DS_ID,
      actorUserId: ACTOR,
    });

    expect(minted).toBe(false);
    expect(result).toEqual({ company_settlement_id: "cs1", display_id: "5805", status: "closed", already_closed: false });
    expect(inserted[0]).toEqual([OPCO, "5805", "2026-09-08", "2026-09-14", ACTOR]);
  });

  it("R-200: a header that already carries that AlwaysTrack number is reused (team tour), never duplicated", async () => {
    let inserted = false;
    const client = makeClient({
      "COALESCE(source_document_ref, display_id)": () => ({ rows: [{ n: "5805" }] }),
      "FROM driver_finance.driver_settlements": () => ({
        rows: [{ period_start: "2026-09-08", period_end: "2026-09-14", status: "closed" }],
      }),
      "FROM accounting.company_settlement_driver_settlements": () => ({ rows: [] }),
      "AND display_id = $2 AND voided_at IS NULL": () => ({ rows: [{ id: "cs-existing" }] }),
      "INSERT INTO accounting.company_settlements": () => {
        inserted = true;
        return { rows: [{ id: "cs-new" }] };
      },
      "INSERT INTO accounting.company_settlement_driver_settlements": () => ({ rows: [] }),
      "SELECT status, voided_at::text FROM accounting.company_settlements": () => ({
        rows: [{ status: "open", voided_at: null }],
      }),
      "UPDATE accounting.company_settlements": () => ({
        rows: [{ id: "cs-existing", display_id: "5805", status: "closed" }],
      }),
    });
    const result = await closeCompanySettlementAlongsideDriverSettlement(client as never, {
      operatingCompanyId: OPCO,
      driverSettlementId: DS_ID,
      actorUserId: ACTOR,
    });
    expect(inserted).toBe(false);
    expect(result.company_settlement_id).toBe("cs-existing");
  });

  it("R-200: a driver settlement with no number is refused — the app never invents one", async () => {
    const client = makeClient({
      "COALESCE(source_document_ref, display_id)": () => ({ rows: [{ n: null }] }),
      "FROM driver_finance.driver_settlements": () => ({
        rows: [{ period_start: "2026-09-08", period_end: "2026-09-14", status: "closed" }],
      }),
      "FROM accounting.company_settlement_driver_settlements": () => ({ rows: [] }),
    });
    await expect(
      closeCompanySettlementAlongsideDriverSettlement(client as never, { operatingCompanyId: OPCO, driverSettlementId: DS_ID, actorUserId: ACTOR })
    ).rejects.toMatchObject({ code: "driver_settlement_has_no_number" });
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
      "COALESCE(source_document_ref, display_id)": () => {
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


it("REG-040 shared company remains open until every nonvoid linked tour closes", async () => {
  const client = makeClient({
    "FROM driver_finance.driver_settlements": () => ({ rows: [{ period_start: "2026-08-01", period_end: "2026-08-07", status: "closed" }] }),
    "FROM accounting.company_settlement_driver_settlements": () => ({ rows: [{ company_settlement_id: "shared-cs" }] }),
    "SELECT status, voided_at::text FROM accounting.company_settlements": (sql, values) => {
      expect(sql).toContain("operating_company_id = $2::uuid FOR UPDATE");
      expect(values).toEqual(["shared-cs", OPCO]);
      return { rows: [{ status: "open", voided_at: null }] };
    },
    "UPDATE accounting.company_settlements": (sql, values) => {
      expect(sql).toContain("BOOL_AND(ds.status IN");
      expect(sql).toContain("ds.trip_closed_at IS NOT NULL");
      expect(sql).toContain("ds.voided_at IS NULL");
      expect(sql).toContain("MIN(ds.period_start)");
      expect(sql).toContain("MAX(ds.period_end)");
      expect(sql).toContain("THEN 'closed' ELSE 'open'");
      expect(values).toEqual(["shared-cs", ACTOR, OPCO]);
      return { rows: [{ id: "shared-cs", display_id: "CS-2026-0003", status: "open" }] };
    },
  });
  const result = await closeCompanySettlementAlongsideDriverSettlement(client as never, { operatingCompanyId: OPCO, driverSettlementId: DS_ID, actorUserId: ACTOR });
  expect(result.status).toBe("open");
  expect(result.company_settlement_id).toBe("shared-cs");
});
