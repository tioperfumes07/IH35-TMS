import { describe, expect, it, vi } from "vitest";

const audit = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: audit }));

const { linkRelayFillExpenseToFuelRow, adoptRelayFillExpenseDocument } = await import("../fuel-expense-document.service.js");

// ENG-65 (LEAD 11-03): 90 live Relay fill documents ($38,717.03) carried source_fuel_transaction_id NULL — they were adopted
// on receipt before the fill's fuel records existed, and the later adopt (Settlement Creator) never linked them.
const CO = "5c854333-6ea5-4faa-af31-67cb272fef80";

function client(opts: { primary?: string | null; updated?: boolean; existingDoc?: string | null }) {
  const seen: string[] = [];
  return {
    seen,
    query: vi.fn(async (sql: string) => {
      seen.push(sql);
      if (sql.includes("FROM accounting.expenses") && sql.includes("journal_entry_id = $2")) {
        return { rows: opts.existingDoc ? [{ id: opts.existingDoc }] : [] };
      }
      if (sql.includes("FROM fuel.fuel_transactions ft") && sql.includes("ORDER BY ft.total_cost DESC")) {
        return { rows: opts.primary ? [{ id: opts.primary }] : [] };
      }
      if (sql.includes("SET source_fuel_transaction_id")) return { rows: opts.updated === false ? [] : [{ id: "exp-1" }] };
      return { rows: [] };
    }),
  };
}

describe("linkRelayFillExpenseToFuelRow", () => {
  it("links the document to the fill's primary free record and audits it", async () => {
    audit.mockClear();
    const c = client({ primary: "ft-diesel" });
    const id = await linkRelayFillExpenseToFuelRow(c as never, { operating_company_id: CO, expense_id: "exp-1", relay_fill_id: "rf-1", actor_user_uuid: "u1" });
    expect(id).toBe("ft-diesel");
    const pick = c.seen.find((s) => s.includes("ORDER BY ft.total_cost DESC"))!;
    expect(pick).toContain("ft.voided_at IS NULL");
    expect(pick).toContain("NOT EXISTS (SELECT 1 FROM accounting.expenses e WHERE e.source_fuel_transaction_id = ft.id AND e.voided_at IS NULL)");
    const upd = c.seen.find((s) => s.includes("SET source_fuel_transaction_id"))!;
    expect(upd).toContain("source_fuel_transaction_id IS NULL"); // fill-once: never re-points a set link
    expect(audit).toHaveBeenCalledWith(expect.anything(), "u1", "accounting.expense.relay_fill_fuel_record_linked", expect.objectContaining({ source_fuel_transaction_id: "ft-diesel" }), "info", "ENG-65");
  });

  it("no free record yet → links nothing (the Creator's later adopt links it)", async () => {
    audit.mockClear();
    const c = client({ primary: null });
    expect(await linkRelayFillExpenseToFuelRow(c as never, { operating_company_id: CO, expense_id: "exp-1", relay_fill_id: "rf-1", actor_user_uuid: "u1" })).toBeNull();
    expect(c.seen.some((s) => s.includes("SET source_fuel_transaction_id"))).toBe(false);
    expect(audit).not.toHaveBeenCalled();
  });

  it("an already-linked document is never re-pointed (UPDATE matches 0 rows → null, no audit)", async () => {
    audit.mockClear();
    const c = client({ primary: "ft-x", updated: false });
    expect(await linkRelayFillExpenseToFuelRow(c as never, { operating_company_id: CO, expense_id: "exp-1", relay_fill_id: "rf-1", actor_user_uuid: "u1" })).toBeNull();
    expect(audit).not.toHaveBeenCalled();
  });

  it("adopt on an EXISTING document links it (the moment ENG-65 was missed)", async () => {
    const c = client({ existingDoc: "exp-1", primary: "ft-diesel" });
    const out = await adoptRelayFillExpenseDocument(c as never, { operating_company_id: CO, relay_fill_id: "rf-1", journal_entry_id: "je-1", requesting_user_uuid: "u1" });
    expect(out).toMatchObject({ outcome: "already_exists", expense_id: "exp-1" });
    expect(c.seen.some((s) => s.includes("SET source_fuel_transaction_id"))).toBe(true);
  });
});
