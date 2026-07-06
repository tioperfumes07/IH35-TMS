import { describe, expect, it, vi } from "vitest";
import {
  buildTransp20241231OpeningBalanceImportPreview,
  signedCentsToDebitCredit,
} from "../opening-balance-import.service.js";
import { TRANSP_OPENING_BALANCE_SOURCE_LINES } from "../transp-2024-12-31-source.js";

const { mockIsEnabled } = vi.hoisted(() => ({ mockIsEnabled: vi.fn() }));
vi.mock("../../../lib/feature-flags/service.js", () => ({ isEnabled: mockIsEnabled }));

const OPCO = "11111111-1111-4111-8111-111111111111";

describe("signedCentsToDebitCredit — signed-actual convention (not natural-side)", () => {
  it("Asset: positive => debit, negative => credit", () => {
    expect(signedCentsToDebitCredit("Asset", 10000)).toEqual({ debit_or_credit: "debit", amount_cents: 10000 });
    expect(signedCentsToDebitCredit("Asset", -7649908)).toEqual({ debit_or_credit: "credit", amount_cents: 7649908 });
  });
  it("Liability/Equity: positive => credit, negative => debit", () => {
    expect(signedCentsToDebitCredit("Liability", 500000)).toEqual({ debit_or_credit: "credit", amount_cents: 500000 });
    expect(signedCentsToDebitCredit("Liability", -19292598)).toEqual({ debit_or_credit: "debit", amount_cents: 19292598 });
    expect(signedCentsToDebitCredit("Equity", -838493937)).toEqual({ debit_or_credit: "debit", amount_cents: 838493937 });
  });
  it("zero => null (nothing to post)", () => {
    expect(signedCentsToDebitCredit("Asset", 0)).toBeNull();
  });
});

describe("buildTransp20241231OpeningBalanceImportPreview", () => {
  function client(rows: Array<{ id: string; account_name: string }>) {
    return { query: vi.fn(async () => ({ rows })) };
  }

  it("flag OFF => returns flag_off with no JE preview", async () => {
    mockIsEnabled.mockResolvedValue(false);
    const result = await buildTransp20241231OpeningBalanceImportPreview(client([]) as never, OPCO);
    expect(result.flag_off).toBe(true);
    expect(result.je_preview).toBeNull();
    expect(result.ready_to_post).toBe(false);
  });

  it("flag ON, zero accounts mapped => every non-zero line is unmapped, no JE preview", async () => {
    mockIsEnabled.mockResolvedValue(true);
    const result = await buildTransp20241231OpeningBalanceImportPreview(client([]) as never, OPCO);
    expect(result.flag_off).toBe(false);
    const nonZeroLineCount = TRANSP_OPENING_BALANCE_SOURCE_LINES.filter((l) => l.amount_cents !== 0).length;
    expect(result.unmapped.length).toBe(TRANSP_OPENING_BALANCE_SOURCE_LINES.length); // even zero lines report unmapped
    expect(result.je_preview).toBeNull();
    expect(result.ready_to_post).toBe(false);
    expect(nonZeroLineCount).toBeGreaterThan(0);
  });

  it("flag ON, ALL accounts mapped (exact name match) => balanced JE preview, ready_to_post=true", async () => {
    mockIsEnabled.mockResolvedValue(true);
    const rows = TRANSP_OPENING_BALANCE_SOURCE_LINES.map((l, i) => ({
      id: `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, "0")}`,
      account_name: l.qbo_account_label,
    }));
    const result = await buildTransp20241231OpeningBalanceImportPreview(client(rows) as never, OPCO);
    expect(result.unmapped).toHaveLength(0);
    expect(result.is_balanced).toBe(true);
    expect(result.ready_to_post).toBe(true);
    expect(result.je_preview).not.toBeNull();
    expect(result.total_debits_cents).toBe(result.total_credits_cents);
    expect(result.total_debits_cents).toBeGreaterThan(0);
    // every posting line references a matched account id, and debits===credits (createJournalEntry's own invariant)
    const debits = result.je_preview!.postings.filter((p) => p.debit_or_credit === "debit").reduce((s, p) => s + p.amount_cents, 0);
    const credits = result.je_preview!.postings.filter((p) => p.debit_or_credit === "credit").reduce((s, p) => s + p.amount_cents, 0);
    expect(debits).toBe(credits);
    // headline tie-out is independent of mapping and must always hold (source-data self-check)
    expect(result.headline_tie_out.ties_to_doc).toBe(true);
  });

  it("normalized (fuzzy) match works when the live account name differs only by punctuation/case", async () => {
    mockIsEnabled.mockResolvedValue(true);
    const rows = [{ id: "bbbbbbbb-0000-4000-8000-000000000001", account_name: "boa checking 1135" }]; // vs "BOA-CHECKING-1135"
    const result = await buildTransp20241231OpeningBalanceImportPreview(client(rows) as never, OPCO);
    const line = result.lines.find((l) => l.qbo_account_label === "BOA-CHECKING-1135");
    expect(line?.matched_account_id).toBe("bbbbbbbb-0000-4000-8000-000000000001");
    expect(line?.match_method).toBe("normalized");
  });

  it("partial mapping (some accounts missing) => unmapped non-empty, je_preview stays null (never a partial JE)", async () => {
    mockIsEnabled.mockResolvedValue(true);
    const rows = [{ id: "cccccccc-0000-4000-8000-000000000001", account_name: TRANSP_OPENING_BALANCE_SOURCE_LINES[0].qbo_account_label }];
    const result = await buildTransp20241231OpeningBalanceImportPreview(client(rows) as never, OPCO);
    expect(result.unmapped.length).toBeGreaterThan(0);
    expect(result.je_preview).toBeNull();
    expect(result.ready_to_post).toBe(false);
  });
});
