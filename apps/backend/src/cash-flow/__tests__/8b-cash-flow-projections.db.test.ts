/**
 * 8b: cash-flow projections — card payable 2510, relay wallet top-ups,
 * late-load invoice effective due date, projected-cash-date wiring.
 *
 * Source-level tests: read the service file and verify the 443.140 #8(b)
 * projection sources are wired. A test fails if any source is missing
 * (i.e. "fails on old code before the feature").
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "../../../../..");
const SVC = readFileSync(resolve(ROOT, "apps/backend/src/cash-flow/cash-flow.service.ts"), "utf8");
const PROJ = readFileSync(resolve(ROOT, "apps/backend/src/cash-flow/projected-cash-date.ts"), "utf8");

describe("8b: cash-flow projections wired (443.140)", () => {
  it("rolling ledger includes card payable 2510 query", () => {
    expect(
      /cardPayable2510Promise|card_payable_2510|Card Payable.*Fuel Card/.test(SVC),
      "cash-flow.service.ts must include card_payable_2510 section"
    ).toBe(true);
  });

  it("rolling ledger includes relay wallet top-up query", () => {
    expect(
      /relayTopupPromise|relay_topup|Relay Wallet Top-Up/i.test(SVC),
      "cash-flow.service.ts must include relay_topup section"
    ).toBe(true);
  });

  it("invoice query uses load delivery appointment for late-load effective due date", () => {
    expect(
      /LATE LOAD MOVES ITS RECEIPT|fd\.scheduled_arrival_at.*days_until_due/.test(SVC),
      "cash-flow.service.ts must use load delivery appointment to compute effective invoice due date"
    ).toBe(true);
  });

  it("document_kind type union includes card_payable and relay_topup", () => {
    expect(SVC).toContain('"card_payable"');
    expect(SVC).toContain('"relay_topup"');
  });

  it("card payable 2510 rows have row_kind expense and correct document_kind", () => {
    expect(SVC).toContain("document_kind: \"card_payable\"");
    expect(SVC).toContain("row_kind: \"expense\"");
  });

  it("relay top-up rows have document_kind relay_topup", () => {
    expect(SVC).toContain("document_kind: \"relay_topup\"");
  });

  it("projected-cash-date handles factoring_eligible customers (Faro funding date)", () => {
    expect(PROJ).toContain("factoring_eligible");
  });

  it("projected-cash-date handles net payment terms (days_until_due)", () => {
    expect(PROJ).toContain("days_until_due");
  });

  it("card payable section queries debit_or_credit on journal_entry_postings", () => {
    expect(SVC).toContain("debit_or_credit");
  });

  it("relay top-up section queries cash_flow_adjustments with relay label filter", () => {
    expect(SVC).toContain("relay_topup");
    expect(SVC).toMatch(/label ILIKE.*relay/i);
  });

  it("getRollingLedgerRows fires card_payable and relay_topup concurrently via Promise.all", () => {
    expect(SVC).toContain("cardPayable2510Promise");
    expect(SVC).toContain("relayTopupPromise");
    expect(SVC).toMatch(/Promise\.all\(\[[\s\S]*cardPayable2510Promise[\s\S]*relayTopupPromise/);
  });
});
