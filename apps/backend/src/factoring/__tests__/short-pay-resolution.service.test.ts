import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateJe, mockResolveRole, mockLink, mockSpine, mockDisplay, mockAudit } = vi.hoisted(() => ({
  mockCreateJe: vi.fn(), mockResolveRole: vi.fn(), mockLink: vi.fn(), mockSpine: vi.fn(), mockDisplay: vi.fn(), mockAudit: vi.fn(),
}));
vi.mock("../../accounting/journal-entries.service.js", () => ({ createJournalEntryOnClient: mockCreateJe }));
vi.mock("../../accounting/coa-roles/resolver.service.js", () => ({ resolveRoleAccount: mockResolveRole }));
vi.mock("../../accounting/accounting-spine-emit.js", () => ({ writeTransactionSourceLink: mockLink }));
vi.mock("../factoring-spine-links.js", () => ({ writeFactoringSpineLinks: mockSpine }));
vi.mock("../../accounting/display-id.js", () => ({ resolveCreditMemoDisplayId: mockDisplay }));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: mockAudit }));

import { resolveFaroShortPay } from "../short-pay-resolution.service.js";

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const base = { operating_company_id: OPCO, entry_id: "e-1", actor_user_id: "owner", actor_role: "Owner" };

function client(opts: { kind?: string; resolution?: string | null; total?: string; paid?: string; applied?: string; accounts?: number } = {}) {
  return {
    query: vi.fn(async (sql: string) => {
      if (sql.includes("FROM accounting.faro_reserve_entries WHERE id")) return { rows: [{ id: "e-1", entry_kind: opts.kind ?? "short_pay", amount_cents: "-25000", faro_invoice_number: "012", short_pay_resolution: opts.resolution ?? null, entry_date: "2026-09-05" }] };
      if (sql.includes("FROM accounting.factoring_purchase_lines l JOIN accounting.invoices i")) return { rows: [{ invoice_id: "inv-1", customer_id: "cust-1", invoice_display_id: "13520", total_cents: opts.total ?? "400000", amount_paid_cents: opts.paid ?? "375000" }] };
      if (sql.includes("system_purpose = $2")) return { rows: Array.from({ length: opts.accounts ?? 1 }, () => ({ id: "acct-4955" })) };
      if (sql.includes("FROM accounting.credit_memo_applications")) return { rows: [{ c: opts.applied ?? "0" }] };
      if (sql.includes("INSERT INTO accounting.credit_memos")) return { rows: [{ id: "cm-1" }] };
      if (sql.includes("SELECT id::text FROM accounting.journal_entry_postings")) return { rows: [{ id: "p1" }, { id: "p2" }] };
      return { rows: [], rowCount: 1 };
    }),
  };
}

beforeEach(() => {
  for (const m of [mockCreateJe, mockResolveRole, mockLink, mockSpine, mockDisplay, mockAudit]) m.mockReset();
  mockCreateJe.mockResolvedValue({ id: "je-wd" });
  mockResolveRole.mockResolvedValue("acct-1100");
  mockDisplay.mockResolvedValue("CM-0001");
});

describe("owner ruling 2026-10-02 — short-pay customer side", () => {
  it("write-down: reason-coded credit memo applied to the invoice + DR reason / CR A/R, linked to the same Faro entry, invoice and memo", async () => {
    const c = client();
    const r = await resolveFaroShortPay(c, { ...base, resolution: "written_down", reason: "billing_error" });
    expect(r).toMatchObject({ resolution: "written_down", credit_memo_id: "cm-1", journal_entry_id: "je-wd", amount_cents: 25000 });
    const sqls = c.query.mock.calls.map((x) => String(x[0]));
    expect(sqls.some((s) => s.includes("INSERT INTO accounting.credit_memo_applications"))).toBe(true);
    const memoInsert = c.query.mock.calls.find((x) => String(x[0]).includes("INSERT INTO accounting.credit_memos"))!;
    expect((memoInsert[1] as unknown[])[3]).toBe("billing_error_ours");
    const je = mockCreateJe.mock.calls[0]![1];
    expect(je.postings.map((p: { account_id: string; debit_or_credit: string; amount_cents: number }) => `${p.debit_or_credit}:${p.account_id}:${p.amount_cents}`)).toEqual([
      "debit:acct-4955:25000",
      "credit:acct-1100:25000",
    ]);
    expect(je.postings[1]).toMatchObject({ source_transaction_type: "faro_reserve_entry", source_transaction_id: "e-1", entity_type: "customer", entity_uuid: "cust-1" });
    expect(mockResolveRole).toHaveBeenCalledWith(expect.anything(), OPCO, "ar_control");
    expect(mockSpine).toHaveBeenCalledWith(c, OPCO, "je-wd", "faro_short_pay_write_down");
    expect(mockLink.mock.calls.map((x) => x[1].linked_object_type)).toEqual(["credit_memo", "credit_memo"]);
  });

  it("keep open posts nothing", async () => {
    const c = client();
    await expect(resolveFaroShortPay(c, { ...base, resolution: "kept_open" })).rejects.toThrow("short_pay_keep_open_needs_dispute_note");
    const r = await resolveFaroShortPay(c, { ...base, resolution: "kept_open", note: "Disputing with CTS: POD shows on-time delivery" });
    expect(r).toEqual({ entry_id: "e-1", resolution: "kept_open" });
    expect(mockCreateJe).not.toHaveBeenCalled();
    expect(c.query.mock.calls.some((x) => String(x[0]).includes("INSERT INTO accounting.credit_memos"))).toBe(false);
  });

  it("refuses: not the Owner, not a short-pay, already written down, no reason, more than the invoice still owes", async () => {
    await expect(resolveFaroShortPay(client(), { ...base, actor_role: "Accountant", resolution: "kept_open", note: "disputing it now" })).rejects.toThrow("short_pay_resolution_owner_only");
    await expect(resolveFaroShortPay(client({ kind: "schedule_fee" }), { ...base, resolution: "kept_open", note: "disputing it now" })).rejects.toThrow("faro_entry_is_not_a_short_pay");
    await expect(resolveFaroShortPay(client({ resolution: "written_down" }), { ...base, resolution: "written_down", reason: "bad_debt" })).rejects.toThrow("short_pay_already_written_down");
    await expect(resolveFaroShortPay(client(), { ...base, resolution: "written_down" })).rejects.toThrow("short_pay_reason_required");
    await expect(resolveFaroShortPay(client({ paid: "390000" }), { ...base, resolution: "written_down", reason: "bad_debt" })).rejects.toThrow("short_pay_exceeds_invoice_open_balance");
    expect(mockCreateJe).not.toHaveBeenCalled();
  });
});
