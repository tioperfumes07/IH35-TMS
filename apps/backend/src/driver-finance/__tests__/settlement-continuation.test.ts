import { describe, expect, it, vi } from "vitest";
import { reopenSettlementForContinuationInClientTx } from "../settlement-continuation.service.js";
import { claimSettlementPayRunInClientTx } from "../settlement-payrun-claim.service.js";
const { reverse } = vi.hoisted(() => ({ reverse: vi.fn() }));
vi.mock("../settlement-payrun-reverse.service.js", () => ({ reverseSettlementPayRunInClientTx: reverse }));
const input = { operatingCompanyId: "5c854333-6ea5-4faa-af31-67cb272fef80", settlementId: "settlement", loadId: "next-load", actorUserId: "actor" };

describe("REG-040 audited same-identity continuation", () => {
  it("reverses before reopening and preserves source identity and old financial snapshot in audit", async () => {
    const events: string[] = [];
    const snapshot = { id: "settlement", display_id: "S-2026-0006", first_load_id: "original-load", posted_at: "2026-09-01", gross_pay: "500.00" };
    reverse.mockReset().mockImplementation(async () => { events.push("reverse"); return { result: "reversed", reversal_journal_entry_id: "reversal-je" }; });
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("to_jsonb(s)")) return { rows: [{ status: "closed", trip_closed_at: "2026-09-01", voided_at: null, snapshot }] };
      if (sql.includes("SET status = 'open'")) events.push("reopen");
      return { rows: [] };
    });
    expect(await reopenSettlementForContinuationInClientTx({ query } as never, input)).toBe(true);
    expect(events).toEqual(["reverse", "reopen"]);
    const update = query.mock.calls.find(([sql]) => sql.includes("SET status = 'open'"))![0];
    expect(update).not.toMatch(/display_id\s*=|first_load_id\s*=|gross_pay\s*=|net_pay\s*=/);
    const audit = (query.mock.calls as unknown as [string, unknown[]][]).find(([sql]) => sql.includes("audit.append_event"))!;
    const payload = JSON.parse(audit[1][2] as string);
    expect(payload.previous_settlement).toEqual(snapshot);
    expect(payload.reversal.reversal_journal_entry_id).toBe("reversal-je");
  });

  it("open continuation is idempotent and does not reverse twice", async () => {
    reverse.mockReset();
    const query = vi.fn(async (sql: string) => ({ rows: sql.includes("to_jsonb(s)") ? [{ status: "open", trip_closed_at: null, voided_at: null, snapshot: {} }] : [] }));
    expect(await reopenSettlementForContinuationInClientTx({ query }, input)).toBe(false);
    expect(reverse).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(3);
  });

  it("does not reopen when the real reversal fails", async () => {
    reverse.mockReset().mockRejectedValue(new Error("REVERSAL_NOT_EQUAL_AND_OPPOSITE"));
    const query = vi.fn(async (sql: string) => ({ rows: sql.includes("to_jsonb") ? [{ status: "closed", trip_closed_at: "2026-09-01", voided_at: null, snapshot: { posted_at: "2026-09-01" } }] : [] }));
    await expect(reopenSettlementForContinuationInClientTx({ query } as never, input)).rejects.toThrow("REVERSAL_NOT_EQUAL_AND_OPPOSITE");
    expect(query.mock.calls.some(([sql]) => sql.includes("SET status = 'open'"))).toBe(false);
  });
});

describe("REG-040 void-aware repost idempotency anchor", () => {
  it("claims a voided anchor once, audits the old JE, and the retry returns the new JE", async () => {
    let status = "void";
    let journal: string | null = "original-je";
    const audits: unknown[][] = [];
    const query = vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes("historical_settlement_attributions") || sql.includes("SELECT id FROM driver_finance.driver_settlements")) return { rows: [] };
      if (sql.includes("INSERT INTO")) return { rows: [] };
      if (sql.includes("SELECT reversal.id")) return { rows: [{ id: "reversal-je" }] };
      if (sql.includes("SELECT id::text")) return { rows: [{ id: "run", status, journal_entry_id: journal }] };
      if (sql.includes("audit.append_event")) { audits.push(values!); return { rows: [] }; }
      if (sql.includes("UPDATE")) { status = "posted"; journal = null; return { rows: [{ id: "run", journal_entry_id: null }] }; }
      throw new Error(sql);
    });
    const first = await claimSettlementPayRunInClientTx({ query } as never, input);
    expect(first).toEqual({ claimed: true, run: { id: "run", journal_entry_id: null } });
    expect(JSON.parse(audits[0][2] as string).superseded_journal_entry_id).toBe("original-je");
    journal = "reposted-je"; // The unchanged close poster writes its new canonical JE on this anchor.
    const second = await claimSettlementPayRunInClientTx({ query } as never, input);
    expect(second.claimed).toBe(false);
    expect(second.run.journal_entry_id).toBe("reposted-je");
    expect(audits).toHaveLength(1);
    expect(query.mock.calls.filter(([sql]) => sql.includes("UPDATE driver_finance.payrun_gl_runs"))).toHaveLength(1);
  });
  it("never reclaims an already posted run", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: "run", status: "posted", journal_entry_id: "current-je" }] });
    expect((await claimSettlementPayRunInClientTx({ query }, input)).claimed).toBe(false);
    expect(query).toHaveBeenCalledTimes(4);
  });
  it("refuses a void anchor whose original money has no immutable reversal", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "run", status: "void", journal_entry_id: "original-je" }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(claimSettlementPayRunInClientTx({ query }, input)).rejects.toThrow();
    expect(query).toHaveBeenCalledTimes(5);
  });
});
