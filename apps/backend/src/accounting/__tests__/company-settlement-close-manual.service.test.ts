import { describe, expect, it } from "vitest";
import { closeCompanySettlementManual, CompanySettlementCloseError } from "../company-settlement-close-manual.service.js";

const OPCO = "11111111-1111-4111-8111-111111111111";
const CS_ID = "22222222-2222-4222-8222-222222222222";
const DS_ID = "33333333-3333-4333-8333-333333333333";
const JE_ID = "44444444-4444-4444-8444-444444444444";
const USER_ID = "55555555-5555-4555-8555-555555555555";

function mockClient(overrides: {
  header?: { id: string; display_id: string; status: string; voided_at: string | null };
  linked?: Array<{ driver_settlement_id: string; display_id: string }>;
  glBills?: Array<{ settlement_id: string; bill_journal_entry_id: string | null }>;
  jeStatus?: Array<{ id: string; status: string }>;
}) {
  const header = overrides.header ?? { id: CS_ID, display_id: "CS-2026-0001", status: "open", voided_at: null };
  const linked = overrides.linked ?? [{ driver_settlement_id: DS_ID, display_id: "S-13642" }];
  const glBills = overrides.glBills ?? [];
  const jeStatus = overrides.jeStatus ?? [];
  const calls: string[] = [];
  return {
    calls,
    query: async (sql: string) => {
      if (sql.includes("FROM accounting.company_settlements") && sql.includes("SELECT id::text, display_id, status, voided_at")) {
        calls.push("select_header");
        return { rows: [header] };
      }
      if (sql.includes("FROM accounting.company_settlement_driver_settlements csds") && sql.includes("JOIN driver_finance.driver_settlements")) {
        calls.push("select_linked");
        return { rows: linked };
      }
      if (sql.includes("FROM driver_finance.driver_settlement_gl_bills")) {
        calls.push("select_gl_bills");
        return { rows: glBills };
      }
      if (sql.includes("FROM accounting.journal_entries WHERE id = ANY")) {
        calls.push("select_je_status");
        return { rows: jeStatus };
      }
      if (sql.includes("UPDATE accounting.company_settlements")) {
        calls.push("update_close");
        return { rows: [{ id: header.id, display_id: header.display_id, status: "closed" }] };
      }
      throw new Error(`unexpected query: ${sql.slice(0, 80)}`);
    },
  };
}

describe("closeCompanySettlementManual (M.3)", () => {
  it("refuses without explicit confirm=true", async () => {
    const client = mockClient({});
    await expect(
      closeCompanySettlementManual(client, { operatingCompanyId: OPCO, companySettlementId: CS_ID, actorUserId: USER_ID, confirm: false })
    ).rejects.toMatchObject({ code: "confirmation_required" });
  });

  it("refuses to close when a linked driver settlement has no GL posting (fail-closed, never new GL math)", async () => {
    const client = mockClient({ glBills: [] });
    await expect(
      closeCompanySettlementManual(client, { operatingCompanyId: OPCO, companySettlementId: CS_ID, actorUserId: USER_ID, confirm: true })
    ).rejects.toMatchObject({ code: "linked_driver_settlements_not_gl_posted", details: { unposted_display_ids: ["S-13642"] } });
    expect(client.calls).not.toContain("update_close");
  });

  it("refuses to close when the linked journal entry has been voided", async () => {
    const client = mockClient({
      glBills: [{ settlement_id: DS_ID, bill_journal_entry_id: JE_ID }],
      jeStatus: [{ id: JE_ID, status: "voided" }],
    });
    await expect(
      closeCompanySettlementManual(client, { operatingCompanyId: OPCO, companySettlementId: CS_ID, actorUserId: USER_ID, confirm: true })
    ).rejects.toMatchObject({ code: "linked_journal_entry_voided" });
    expect(client.calls).not.toContain("update_close");
  });

  it("closes when every linked driver settlement is GL-posted with a real, non-voided journal entry", async () => {
    const client = mockClient({
      glBills: [{ settlement_id: DS_ID, bill_journal_entry_id: JE_ID }],
      jeStatus: [{ id: JE_ID, status: "posted" }],
    });
    const result = await closeCompanySettlementManual(client, {
      operatingCompanyId: OPCO,
      companySettlementId: CS_ID,
      actorUserId: USER_ID,
      confirm: true,
    });
    expect(result.status).toBe("closed");
    expect(result.already_closed).toBe(false);
    expect(result.gl_verified_journal_entry_ids).toEqual([JE_ID]);
    expect(client.calls).toContain("update_close");
  });

  it("is idempotent — returns already_closed=true without re-running the GL check on an already-closed settlement", async () => {
    const client = mockClient({ header: { id: CS_ID, display_id: "CS-2026-0001", status: "closed", voided_at: null } });
    const result = await closeCompanySettlementManual(client, { operatingCompanyId: OPCO, companySettlementId: CS_ID, actorUserId: USER_ID, confirm: true });
    expect(result.already_closed).toBe(true);
    expect(client.calls).not.toContain("select_gl_bills");
  });

  it("refuses to close a voided company settlement (void-not-delete: never resurrect)", async () => {
    const client = mockClient({ header: { id: CS_ID, display_id: "CS-2026-0001", status: "open", voided_at: "2026-09-01T00:00:00Z" } });
    await expect(
      closeCompanySettlementManual(client, { operatingCompanyId: OPCO, companySettlementId: CS_ID, actorUserId: USER_ID, confirm: true })
    ).rejects.toMatchObject({ code: "company_settlement_voided" });
  });

  it("throws a typed error when the company settlement does not exist", async () => {
    const client = mockClient({});
    (client as unknown as { query: unknown }).query = async () => ({ rows: [] });
    await expect(
      closeCompanySettlementManual(client, { operatingCompanyId: OPCO, companySettlementId: CS_ID, actorUserId: USER_ID, confirm: true })
    ).rejects.toThrow(CompanySettlementCloseError);
  });
});
