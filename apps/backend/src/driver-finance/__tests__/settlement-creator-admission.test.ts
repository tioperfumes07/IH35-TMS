import { describe, expect, it, vi } from "vitest";
import {
  assertCreatorDraftAdmissible,
  draftAdmissionRefusal,
  FULL_TRANSPORTATION_MESSAGE,
  typedInvoiceDisplayId,
} from "../settlement-creator-admission.js";
import type { SettlementCreatorDraft } from "../settlement-creator.types.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
type F = "faro_usmca" | "faro_transportation" | "direct";
const load = (load_number: string, factoring: F, invoice_number?: string | null) => ({ load_number, factoring, invoice_number });
const draft = (...loads: ReturnType<typeof load>[]) => ({ operating_company_id: USMCA, loads }) as unknown as SettlementCreatorDraft;
const client = (rows: Array<{ display_id: string; load_number: string | null }>) => ({ query: vi.fn(async () => ({ rows })) });

describe("ROUND 443.3 — Settlement Creator admission", () => {
  it("typed Invoice no. becomes <invoice>-<load>; blank is left to the invoice service (CC-1 443.8)", () => {
    expect(typedInvoiceDisplayId({ load_number: "13508", invoice_number: "3" })).toBe("3-13508");
    expect(typedInvoiceDisplayId({ load_number: "13508", invoice_number: " " })).toBeNull();
    expect(typedInvoiceDisplayId({ load_number: "13508" })).toBeNull();
  });

  it("a settlement where every load is Transportation is refused", () => {
    const r = draftAdmissionRefusal(draft(load("13498", "faro_transportation"), load("13508", "faro_transportation")));
    expect(r?.code).toBe("full_transportation_settlement");
    expect(r?.message).toBe(FULL_TRANSPORTATION_MESSAGE);
  });

  it("a mixed settlement (5769 shape: one Transportation, one USMCA) is admitted", () => {
    expect(draftAdmissionRefusal(draft(load("13498", "faro_transportation"), load("13508", "faro_usmca", "3")))).toBeNull();
  });

  it("a non-digit Invoice no. is refused", () => {
    expect(draftAdmissionRefusal(draft(load("13508", "faro_usmca", "INV-3")))?.code).toBe("invoice_number_invalid");
  });

  it("the same typed number on two loads is legal (59-13577, 59-13578)", () => {
    expect(draftAdmissionRefusal(draft(load("13577", "faro_usmca", "59"), load("13578", "faro_usmca", "59")))).toBeNull();
  });

  it("the same load twice in one settlement is refused", () => {
    expect(draftAdmissionRefusal(draft(load("13508", "faro_usmca", "3"), load("13508", "direct")))?.code).toBe("load_number_duplicate");
  });

  it("a number already on ANOTHER load's invoice refuses the whole post, naming the number and the load", async () => {
    const c = client([{ display_id: "3-13508", load_number: "13510" }]);
    await expect(assertCreatorDraftAdmissible(c, draft(load("13508", "faro_usmca", "3")))).rejects.toMatchObject({
      code: "invoice_number_taken",
      message: expect.stringMatching(/Load 13508: invoice 3-13508 is already used by load 13510/),
    });
  });

  it("a re-post of the same load keeps its own invoice number", async () => {
    const c = client([{ display_id: "3-13508", load_number: "13508" }]);
    await expect(assertCreatorDraftAdmissible(c, draft(load("13508", "faro_usmca", "3")))).resolves.toBeUndefined();
  });

  it("the taken check reads only this company's invoices, by <typed>-<load>; blank loads are not checked", async () => {
    const c = client([]);
    await assertCreatorDraftAdmissible(c, draft(load("13508", "faro_usmca", "3"), load("13498", "faro_transportation")));
    const [sql, params] = c.query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toMatch(/i\.operating_company_id = \$1::uuid/);
    expect(params).toEqual([USMCA, ["3-13508"]]);
  });

  it("an all-blank draft makes no taken-number read (the service assigns)", async () => {
    const c = client([]);
    await assertCreatorDraftAdmissible(c, draft(load("13508", "faro_usmca")));
    expect(c.query).not.toHaveBeenCalled();
  });
});
