import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateJe, mockResolveRole } = vi.hoisted(() => ({ mockCreateJe: vi.fn(), mockResolveRole: vi.fn() }));
vi.mock("../../accounting/journal-entries.service.js", () => ({ createJournalEntryOnClient: mockCreateJe }));
vi.mock("../../accounting/coa-roles/resolver.service.js", () => ({ resolveRoleAccount: mockResolveRole }));

import { FaroReserveError, kindOf, parseFaroReserveReport, postFaroReserveEntryOnClient } from "../faro-reserve-entries.service.js";

const H = `"ID","Inv","PO Ref#","Debtor","Pmt Ref","Note","Date","Amount","Balance"`;
const BEGIN = `"","","","","","Beginning Balance","","","0.00"`;
const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";

describe("Faro reserve report — shape validation", () => {
  it("classifies every note Faro prints", () => {
    expect(kindOf("Escrow Reserve Held")).toBe("escrow_held");
    expect(kindOf("Transfer Escrow to Cash")).toBe("escrow_to_cash");
    expect(kindOf("Schedule Fee")).toBe("schedule_fee");
    expect(kindOf("Balance: 4000.00 :: Paid: 3750 :: 250.00 to Rsv :: ")).toBe("short_pay");
    expect(kindOf("Rsv Deposit -- Note: pago ccg")).toBe("rsv_deposit");
    expect(kindOf("Client Payable -- Note: To transfer to IH 35 Reserve ")).toBe("client_payable");
    expect(kindOf("Something new")).toBeNull();
  });

  it("escrow: accepts held + transfer, rejects the Inv/PO swap (row 405560), carries the running balance", () => {
    const csv = [
      H, BEGIN,
      `"393702","002","4483","IMPACT BULK LOGISTICS LLC","","Escrow Reserve Held","08/10/2026","45.00","45.00"`,
      `"405560","1013272-2","059","Refrigerx Transportation LLC","","Escrow Reserve Held","09/08/2026","78.15","123.15"`,
      `"394572","004","2239480","Watco","","Transfer Escrow to Cash","09/10/2026","-25.50","97.65"`,
    ].join("\n");
    const p = parseFaroReserveReport(csv, "escrow");
    expect(p.rows.map((r) => r.entry_kind)).toEqual(["escrow_held", "escrow_to_cash"]);
    expect(p.rejected).toEqual([{ line: 4, faro_entry_id: "405560", reason: "inv_po_swapped", detail: 'Inv "1013272-2" / PO "059"' }]);
    expect(p.ending_balance_cents).toBe(9765);
  });

  it("cash: short-pay arithmetic, IH 35 counterparty, quoted thousands, balance continuity", () => {
    const csv = [
      H, BEGIN,
      `"--","--","","-- RSV Transaction --","USMCA Tank 08/28/2026 ","Rsv Deposit -- Note: pago ccg","08/28/2026","5,000.00","5,000.00"`,
      `"--","--","","-- RSV Transaction --","USMCA Reserve to IH 35 Reserve ","Client Payable -- Note: To transfer to IH 35 Reserve ","09/02/2026","-5,000.00","0.00"`,
      `"395453","012","0015418","CTS XPRESS LLC","14729","Balance: 4000.00 :: Paid: 3750 :: 250.00 to Rsv :: ","09/05/2026","-250.00","-250.00"`,
      `"395044","007","68747","ITS LOGISTICS, LLC","","Schedule Fee","09/06/2026","-0.23","-999.00"`,
    ].join("\n");
    const p = parseFaroReserveReport(csv, "cash");
    expect(p.rows.map((r) => r.entry_kind)).toEqual(["rsv_deposit", "client_payable", "short_pay"]);
    expect(p.rows[1]!.counterparty).toBe("ih35_transportation");
    expect(p.rows[0]!.counterparty).toBeNull();
    expect(p.rows[2]).toMatchObject({ short_pay_balance_cents: 400000, short_pay_paid_cents: 375000, amount_cents: -25000 });
    expect(p.rejected[0]).toMatchObject({ faro_entry_id: "395044", reason: "balance_discontinuity" });
  });

  it("refuses a kind on the wrong register and a report with other columns", () => {
    const p = parseFaroReserveReport([H, BEGIN, `"395044","007","68747","ITS","","Schedule Fee","09/06/2026","-0.23","-0.23"`].join("\n"), "escrow");
    expect(p.rejected[0]!.reason).toBe("kind_not_on_this_register");
    expect(() => parseFaroReserveReport(`"Date","Amount"\n"1","2"`, "cash")).toThrow(FaroReserveError);
  });
});

describe("Faro reserve posters — post what the line says", () => {
  beforeEach(() => {
    mockCreateJe.mockReset().mockResolvedValue({ id: "je-1" });
    mockResolveRole.mockReset().mockImplementation(async (_c: unknown, _o: string, role: string) => `acct:${role}`);
  });

  const entry = (over: Record<string, unknown>) => ({
    id: "e-1", register: "cash", entry_kind: "schedule_fee", faro_entry_id: "395044", amount_cents: "-23", entry_date: "2026-09-06",
    faro_invoice_number: "007", counterparty: null, bank_transaction_id: "bt-1", journal_entry_id: null, ...over,
  });
  const link = { faro_invoice_number: "007", purchase_id: "p-1", purchase_line_id: "l-1", invoice_id: "inv-1", customer_id: "cust-1", escrow_reserve_cents: "4500", purchase_status: "posted", purchase_je: "je-fund" };
  const client = (e: Record<string, unknown>, extra: (sql: string) => unknown[] | null = () => null) => ({
    query: vi.fn(async (sql: string) => {
      const x = extra(sql);
      if (x) return { rows: x };
      if (sql.includes("FROM accounting.faro_reserve_entries WHERE id")) return { rows: [e] };
      if (sql.includes("faro_invoice_number = ANY")) return { rows: [link] };
      return { rows: [], rowCount: 1 };
    }),
  });

  it("schedule fee: DR 6405 transaction fee / CR 1235, stamped to the entry + customer", async () => {
    const c = client(entry({}));
    await postFaroReserveEntryOnClient(c, { operating_company_id: OPCO, entry_id: "e-1", actor_user_id: "u", actor_role: "Owner" });
    const je = mockCreateJe.mock.calls[0]![1];
    expect(je.postings[0]).toMatchObject({ account_id: "acct:factor_transaction_fee", debit_or_credit: "debit", amount_cents: 23, source_transaction_type: "faro_reserve_entry", source_transaction_id: "e-1", entity_type: "customer", entity_uuid: "cust-1" });
    expect(je.postings[1]).toMatchObject({ account_id: "acct:factor_cash_reserve_held", debit_or_credit: "credit", amount_cents: 23 });
    expect(c.query.mock.calls.some((x) => String(x[0]).includes("review_state = 'matched'"))).toBe(true);
  });

  it("short-pay: DR 2150 / CR 1235 — never A/R, which stays open on the customer", async () => {
    await postFaroReserveEntryOnClient(client(entry({ entry_kind: "short_pay", amount_cents: "-25000", faro_invoice_number: "007" })), { operating_company_id: OPCO, entry_id: "e-1", actor_user_id: "u", actor_role: "Owner" });
    const je = mockCreateJe.mock.calls[0]![1];
    expect(je.postings.map((p: { account_id: string }) => p.account_id)).toEqual(["acct:factoring_advance_liability", "acct:factor_cash_reserve_held"]);
  });

  it("client payable to IH 35: DR 8000 intercompany / CR 1235; to us it is a transfer and refuses", async () => {
    await postFaroReserveEntryOnClient(client(entry({ entry_kind: "client_payable", faro_entry_id: null, faro_invoice_number: null, amount_cents: "-500000", counterparty: "ih35_transportation" })), { operating_company_id: OPCO, entry_id: "e-1", actor_user_id: "u", actor_role: "Owner" });
    expect(mockCreateJe.mock.calls[0]![1].postings[0].account_id).toBe("acct:intercompany_receivable_ih35_transportation");
    await expect(postFaroReserveEntryOnClient(client(entry({ entry_kind: "client_payable", faro_entry_id: null, faro_invoice_number: null, amount_cents: "-500000" })), { operating_company_id: OPCO, entry_id: "e-1", actor_user_id: "u", actor_role: "Owner" })).rejects.toThrow("faro_client_payable_to_us_posts_as_a_transfer");
  });

  it("rsv deposit refuses (it posts with its payment match); escrow held matches the funding JE without a new entry", async () => {
    await expect(postFaroReserveEntryOnClient(client(entry({ entry_kind: "rsv_deposit", faro_entry_id: null, faro_invoice_number: null, amount_cents: "500000" })), { operating_company_id: OPCO, entry_id: "e-1", actor_user_id: "u", actor_role: "Owner" })).rejects.toThrow("faro_rsv_deposit_posts_with_its_payment_match");
    const r = await postFaroReserveEntryOnClient(client(entry({ register: "escrow", entry_kind: "escrow_held", amount_cents: "4500" })), { operating_company_id: OPCO, entry_id: "e-1", actor_user_id: "u", actor_role: "Owner" });
    expect(r.journal_entry_id).toBe("je-fund");
    expect(mockCreateJe).not.toHaveBeenCalled();
  });

  it("escrow held that differs from the purchase line refuses; an unresolved Faro invoice refuses", async () => {
    await expect(postFaroReserveEntryOnClient(client(entry({ register: "escrow", entry_kind: "escrow_held", amount_cents: "4600" })), { operating_company_id: OPCO, entry_id: "e-1", actor_user_id: "u", actor_role: "Owner" })).rejects.toThrow("faro_escrow_held_differs_from_purchase_line");
    const noLink = client(entry({}), (sql) => (sql.includes("faro_invoice_number = ANY") ? [] : null));
    await expect(postFaroReserveEntryOnClient(noLink, { operating_company_id: OPCO, entry_id: "e-1", actor_user_id: "u", actor_role: "Owner" })).rejects.toThrow("faro_invoice_number_not_on_any_purchase_line");
  });

  it("escrow -> cash posts ONE entry for the pair: DR 1235 (cash side) / CR 1230 (escrow side)", async () => {
    const cashSide = entry({ id: "e-cash", entry_kind: "escrow_to_cash", amount_cents: "2550", faro_entry_id: "394572", faro_invoice_number: "004" });
    const escrowSide = { ...cashSide, id: "e-esc", register: "escrow", amount_cents: "-2550", bank_transaction_id: "bt-2" };
    const c = { query: vi.fn(async (sql: string, v?: unknown[]) => {
      if (sql.includes("FROM accounting.faro_reserve_entries WHERE id")) return { rows: [v?.[0] === "e-esc" ? escrowSide : cashSide] };
      if (sql.includes("register <> $3")) return { rows: [{ id: "e-esc" }] };
      if (sql.includes("faro_invoice_number = ANY")) return { rows: [{ ...link, faro_invoice_number: "004" }] };
      return { rows: [], rowCount: 1 };
    }) };
    const r = await postFaroReserveEntryOnClient(c, { operating_company_id: OPCO, entry_id: "e-cash", actor_user_id: "u", actor_role: "Owner" });
    expect(r.paired_entry_id).toBe("e-esc");
    const je = mockCreateJe.mock.calls[0]![1];
    expect(je.postings[0]).toMatchObject({ account_id: "acct:factor_cash_reserve_held", debit_or_credit: "debit", source_transaction_id: "e-cash" });
    expect(je.postings[1]).toMatchObject({ account_id: "acct:factor_reserve_held", debit_or_credit: "credit", source_transaction_id: "e-esc" });
    expect(mockCreateJe).toHaveBeenCalledTimes(1);
  });
});
