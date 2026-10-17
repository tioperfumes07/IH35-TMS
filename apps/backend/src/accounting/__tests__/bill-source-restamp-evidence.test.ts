/**
 * LEAD 443.184 / 05:05Z — the bill source re-stamp reads only evidence on record: the settlement AP chain's link row, or a
 * Settlement Creator post's owed_bill_ids (bill 13670-9). Fill-null; one audit event per bill; no money columns.
 */
import { describe, expect, it, vi } from "vitest";
import { restampBillSourceFromEvidence } from "../bill-source-restamp.service.js";

describe("restampBillSourceFromEvidence", () => {
  it("stamps the AP-chain bills and the Creator's owed bill from their own evidence, audited", async () => {
    const calls: Array<{ sql: string; values?: unknown[] }> = [];
    const client = {
      query: vi.fn(async (sql: string, values?: unknown[]) => {
        calls.push({ sql, values });
        if (/SET source = 'settlement_driver_bill'/.test(sql)) return { rows: [{ bill_id: "b1", source: "settlement_driver_bill" }] };
        if (/SET source = 'settlement_creator_owed'/.test(sql)) return { rows: [{ bill_id: "b2", source: "settlement_creator_owed" }] };
        return { rows: [] };
      }),
    };
    const out = await restampBillSourceFromEvidence(client as never, { operatingCompanyId: "co", actorUserId: "a", billIds: ["b1", "b2"] });
    expect(out.map((r) => r.source)).toEqual(["settlement_driver_bill", "settlement_creator_owed"]);
    const owed = calls.find((c) => /settlement_creator_owed/.test(c.sql))!.sql;
    expect(owed).toMatch(/event_class = 'driver_finance\.settlement_creator\.posted'/);
    expect(owed).toMatch(/payload -> 'owed_bill_ids' \? b\.id::text/);
    expect(owed).toMatch(/b\.source IS NULL/);
    expect(owed).not.toMatch(/amount|memo/);
    expect(calls.filter((c) => /audit\.append_event/.test(c.sql))).toHaveLength(2);
  });
});
