import { describe, expect, it, vi } from "vitest";
import { matchSettlementPdfItem, resolveSettlementPdfItem, SETTLEMENT_PDF_ITEM_MAP, USMCA_COMPANY_ID } from "../settlement-pdf-item-map.js";

const id = (desc: string, raw?: string) => matchSettlementPdfItem(USMCA_COMPANY_ID, { description: desc, raw })?.itemId ?? null;

describe("queue item 8 (G-09) — PDF category -> item id map", () => {
  it("the audit's wrong items now resolve to their own item", () => {
    expect(id("OTR-Mexico Tolls & Intl Bridge Expense")).toBe("ea839892-2631-417e-b21d-ca361c238e89");
    expect(id("Driver Reimbursement-Fuel-Def")).toBe("a37d5b67-ac60-4825-8511-37771e719078");
    expect(id("Driver Reimbursement-Fuel-Def")).not.toBe(id("GAS"));
  });

  it("the audit's name drift resolves (PDF name and app name both answer)", () => {
    expect(id("Reefer Trailer-Washout Expense")).toBe("aa07ce99-127c-4a29-af59-68d2bb694ff6");
    expect(id("Warehouse-Lumper Fee Expense")).toBe("e09e3a25-a4c0-404c-abf1-2bb7ac329e45");
    expect(id("Fuel-Reefer Diesel")).toBe(id("Fuel-Reefer-Diesel"));
    expect(id("Road Service-Truck Repair")).toBe("3648d94a-aa3a-45dc-8446-e7128ba1f11a");
    expect(id("OTR-Scale Expense")).toBe("2c31f4d3-1538-4190-87c3-adf2e7e1be12");
  });

  it("the four 'missing' items are on the map", () => {
    for (const c of ["Road Service-Trailer Tire Expense", "TRACTOR-Washout Expense", "Driver Reimbursement-TPE-Scale Expense", "Driver Reimbursement-TPE-Toll Expense"]) expect(id(c)).not.toBeNull();
  });

  it("a mis-parsed 'Drv' description takes the category printed in the raw line; no keyword guessing", () => {
    expect(id("Drv", "LOVES 05/02 Driver Reimbursement-TPE-Scale Expense    Drv    Y    15.25")).toBe("a0a97d92-8e54-41e6-ab0c-37cd23f39869");
    expect(id("toll")).toBeNull();
    expect(id("SOMETHING WASHOUT")).toBeNull();
    expect(matchSettlementPdfItem("91e0bf0a-133f-4ce8-a734-2586cfa66d96", { description: "GAS" })).toBeNull();
  });

  it("every map id is unique per category and reads by id", async () => {
    const entries = SETTLEMENT_PDF_ITEM_MAP[USMCA_COMPANY_ID];
    expect(new Set(entries.map((e) => e.pdfCategory)).size).toBe(entries.length);
    const client = { query: vi.fn(async (_s: string, p?: unknown[]) => ({ rows: [{ id: String(p?.[0]), item_name: "x", expense_account_id: "acct" }] })) };
    const r = await resolveSettlementPdfItem(client, USMCA_COMPANY_ID, { description: "TRACTOR-Washout Expense" });
    expect(r.itemId).toBe("40d73df6-07c0-418f-9e37-c6d7cde5b7b8");
    expect(client.query.mock.calls[0][0]).toMatch(/WHERE id = \$1::uuid/);
    await expect(resolveSettlementPdfItem(client, USMCA_COMPANY_ID, { description: "Mystery" })).rejects.toThrow(/not on the canonical item map/);
  });
});
