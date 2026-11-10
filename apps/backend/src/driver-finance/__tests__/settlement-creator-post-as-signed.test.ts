/**
 * ACCT-F11141 — post a signed settlement exactly as signed: the document's own footing, its identity (what "already as
 * signed" compares), and the root fixes the fork rehearsal found (pure rules; the db test runs the supersede on Postgres).
 */
import { describe, expect, it } from "vitest";
import { signedDocumentFootingErrors, signedIdentity, type SignedSettlement } from "../settlement-creator-post-as-signed.js";
import { BILL_DISPLAY_ID_PATTERN } from "../../accounting/display-id.js";

const doc = (over: Partial<SignedSettlement["drv"]> = {}): SignedSettlement => ({
  num: 5857, start: "2026-10-20", end: "2026-10-26",
  stops: [
    { load: "13692", type: "PICKUP", date: "2026-10-20", city: "Laredo", state: "TX", zip: "78040", truck: "T176", trailer: "FB-56711" },
    { load: "13692", type: "DELIVER", date: "2026-10-23", city: "EDISON", state: "NJ", zip: "08817", truck: "T176", trailer: "FB-56711" },
    { load: "13706", type: "PICKUP", date: "2026-10-23", city: "LINDEN", state: "NJ", zip: "07036", truck: "T176", trailer: "FB-56711" },
    { load: "13706", type: "DELIVER", date: "2026-10-26", city: "CHANNELVIEW", state: "TX", zip: "77530", truck: "T176", trailer: "FB-56711" },
  ],
  charges: [
    { load: "13692", item: "Line Haul", customer: "Semares Forwarding Services", miles: 1958.9, amount: 4900 },
    { load: "13706", item: "Line Haul", customer: "IMPACT BULK LOGISTICS", miles: 1984.3, amount: 3400 },
  ],
  driver_pay: [
    { load: "13692", item: "Loaded Miles", qty: 1890.2, rate: 0.5, total: 945.1 },
    { load: "13706", item: "Loaded Miles", qty: 1574.8, rate: 0.5, total: 787.4 },
    { load: "13706", item: "Empty Miles", qty: 353.2, rate: 0.5, total: 176.6 },
  ],
  fuel: [], expenses: [],
  drv: {
    driver: "Neftali Coronado Urbano", salary: 1909.1,
    add: [{ load: "13692", amount: 25, date: null, desc: "Driver Pay-Enlonada" }, { load: "13692", amount: 25, date: null, desc: "Driver Pay-Desenlonada" }],
    reimb: [], ded: [{ load: "13706", amount: -10, date: "2026-10-26", desc: "Admin fee - GAS" }],
    add_total: 50, reimb_total: 0, ded_total: -10, total_due: 1949.1, ...over,
  },
});

describe("signed settlement document (ACCT-F11141)", () => {
  it("signed #5857 foots: pay lines = salary, salary + additions + reimbursements + deductions = TOTAL DUE 1,949.10", () => {
    expect(signedDocumentFootingErrors(doc())).toEqual([]);
  });
  it("refuses a document whose TOTAL DUE does not foot (one cent off)", () => {
    expect(signedDocumentFootingErrors(doc({ total_due: 1949.11 })).join(" ")).toMatch(/TOTAL DUE 1949\.11/);
  });
  it("refuses a document whose deductions do not foot their lines", () => {
    expect(signedDocumentFootingErrors(doc({ ded_total: -20 })).join(" ")).toMatch(/deduction lines/);
  });
  it("identity = the number, the sorted unique loads and the net in cents (the already-as-signed key)", () => {
    expect(signedIdentity(doc())).toEqual({ settlement_no: "5857", load_numbers: ["13692", "13706"], net_cents: 194910 });
  });
  it("the pay-run close's supplement bill number <load>-S is an accepted bill number (was refused: 13694-S)", () => {
    expect(BILL_DISPLAY_ID_PATTERN.test("13694-S")).toBe(true);
    expect(BILL_DISPLAY_ID_PATTERN.test("13694")).toBe(true);
    expect(BILL_DISPLAY_ID_PATTERN.test("13694-X")).toBe(false);
  });
});
