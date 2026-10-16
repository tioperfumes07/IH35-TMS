/**
 * LEAD 443.168 J — fail-old: on main no engine reads the payee out of the bank description, money-in lines get no
 * suggestion at all, and no suggestion carries a reason. Synthetic names only.
 */
import { describe, expect, it, vi } from "vitest";
import { parseBankDescription, partyTokenShare, resolveDescribedPayee } from "../bank-description-payee.js";
import { applyDescribedPayeeForTransaction } from "../banking-rules.engine.js";

const parties = {
  vendors: [
    { id: "v-acme", name: "Acme Tire Shop LLC", account_id: "acct-repairs" },
    { id: "v-loves", name: "Love's", account_id: "acct-fuel" },
    { id: "v-ana1", name: "Ana Perez", account_id: "acct-driver" },
    { id: "v-ana2", name: "Ana Lopez", account_id: "acct-driver" },
    { id: "v-gerardo", name: "Gerardo Ruiz", account_id: "acct-driver" },
  ],
  customers: [{ id: "c-north", name: "Northwind Freight Inc", account_id: "acct-revenue" }],
};

describe("parseBankDescription", () => {
  it.each([
    ["Zelle payment to Gerardo Ruiz Conf# abc123", "zelle_to", "Gerardo Ruiz"],
    ["Zelle payment from NORTHWIND FREIGHT Conf# x9", "zelle_from", "NORTHWIND FREIGHT"],
    ["WIRE TYPE:WIRE IN DATE:261001 TIME:0901 ET TRN:1 ORIG:NORTHWIND FREIGHT INC ID:123", "wire_in", "NORTHWIND FREIGHT INC"],
    ["WIRE TYPE:WIRE OUT DATE:261001 BNF:ACME TIRE SHOP ID:55", "wire_out", "ACME TIRE SHOP"],
    ["CHECKCARD 0911 ACME TIRE SHOP XXXXX1234", "card", "ACME TIRE SHOP"],
    ["PMNT SENT 0115 CASH APP*GERARDO RUIZ XXXX5678", "pmnt_sent", "GERARDO RUIZ"],
    ["NORTHWIND FREIGHT DES:PAYMENT ID:000123 INDN:USMCA", "ach", "NORTHWIND FREIGHT"],
    ["Relay fuel · T170 · Love's · Natalia, TX · txn_abc", "relay_fuel", "Love's"],
  ])("%s → %s", (desc, pattern, name) => {
    const got = parseBankDescription(desc, null);
    expect(got?.pattern).toBe(pattern);
    expect(got?.name).toBe(name);
  });

  it("a check number names no payee; a wallet deposit names no payee (it is a transfer)", () => {
    expect(parseBankDescription("Check Image 1015", null)).toMatchObject({ pattern: "check", name: "", reference: "1015" });
    expect(parseBankDescription("Relay deposit · card …9830 · x", "Relay deposit")?.name).toBe("");
  });
});

describe("resolveDescribedPayee", () => {
  it("money out → the vendor the text names, with its default expense account and the reason", () => {
    const r = resolveDescribedPayee(parseBankDescription("CHECKCARD 0911 ACME TIRE SHOP XXXXX1234")!, false, parties);
    expect(r).toMatchObject({ vendor_id: "v-acme", customer_id: null, account_id: "acct-repairs" });
    expect(r!.reason).toMatch(/card purchase at "ACME TIRE SHOP" → vendor Acme Tire Shop LLC/);
  });

  it("money in → the customer, never a vendor / expense account", () => {
    const r = resolveDescribedPayee(parseBankDescription("WIRE TYPE:WIRE IN ORIG:NORTHWIND FREIGHT INC ID:1")!, true, parties);
    expect(r).toMatchObject({ vendor_id: null, customer_id: "c-north", account_id: "acct-revenue" });
  });

  it("an ambiguous name says nothing rather than guess", () => {
    expect(resolveDescribedPayee({ pattern: "zelle_to", name: "Ana", reference: null }, false, parties)).toBeNull();
    expect(partyTokenShare("Ana", "Ana Perez")).toBe(0.5);
  });

  it("no party with that name → no suggestion", () => {
    expect(resolveDescribedPayee(parseBankDescription("Zelle payment to Nobody Known Conf# 1")!, false, parties)).toBeNull();
  });
});

describe("applyDescribedPayeeForTransaction (suggest-only, Law B)", () => {
  it("writes suggested_* + reason on a money-in line and nothing else", async () => {
    const sql: string[] = [];
    const query = vi.fn(async (text: string, _values?: unknown[]) => {
      sql.push(text);
      if (/FROM banking\.bank_transactions/.test(text) && /SELECT description/.test(text))
        return { rows: [{ description: "Zelle payment from Northwind Freight Conf# 9", merchant_name: null, is_credit: true }] };
      if (/UPDATE banking\.bank_transactions/.test(text)) return { rows: [], rowCount: 1 };
      return { rows: [] };
    });
    const ok = await applyDescribedPayeeForTransaction({ query } as never, "bt-1", "co-1", parties);
    expect(ok).toBe(true);
    const upd = query.mock.calls.find(([t]) => /UPDATE banking\.bank_transactions/.test(t))!;
    expect(upd[1]).toEqual(["bt-1", null, "c-north", "acct-revenue", "description_payee:zelle_from", expect.stringMatching(/customer Northwind Freight Inc/)]);
    expect(sql.join("\n")).not.toMatch(/categorized_at\s*=|matched_[a-z_]+_id\s*=|journal_entries/);
  });
});
