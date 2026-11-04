import { describe, expect, it } from "vitest";
import {
  buildFaro1090WireProposals,
  classifyWireCandidates,
  wireWindowForPurchases,
  type FaroWireCandidate,
  type OpenPurchaseRow,
  type WireRow,
} from "../faro-1090-wire-proposal.service.js";

function cand(partial: Partial<FaroWireCandidate> & { bank_transaction_id: string }): FaroWireCandidate {
  return {
    transaction_date: "2026-08-15",
    amount_cents: 100_00,
    description: "FARO WIRE",
    merchant_name: "Faro",
    amount_delta_cents: 0,
    day_delta: 0,
    exact_amount: true,
    ...partial,
  };
}

describe("ENG-17 Faro 1090 wire proposal classifier", () => {
  it("NO_EVIDENCE when no candidates", () => {
    expect(classifyWireCandidates([])).toBe("NO_EVIDENCE");
  });

  it("PROPOSED when exactly one exact candidate", () => {
    expect(classifyWireCandidates([cand({ bank_transaction_id: "a" })])).toBe("PROPOSED");
  });

  it("AMBIGUOUS when two exact candidates", () => {
    expect(
      classifyWireCandidates([
        cand({ bank_transaction_id: "a" }),
        cand({ bank_transaction_id: "b", transaction_date: "2026-08-16" }),
      ]),
    ).toBe("AMBIGUOUS");
  });

  it("AMBIGUOUS when one exact sits beside a near candidate", () => {
    expect(
      classifyWireCandidates([
        cand({ bank_transaction_id: "a" }),
        cand({
          bank_transaction_id: "b",
          amount_cents: 100_01,
          amount_delta_cents: 1,
          exact_amount: false,
        }),
      ]),
    ).toBe("AMBIGUOUS");
  });
});

// ACCT-F11071 (rows 89 90 112) — the wire window, exclusivity and short-wire rules.

function purchase(id: string, date: string, net: number): OpenPurchaseRow {
  return { purchase_id: id, display_id: id, purchase_date: date, factoring_advance_id: `adv-${id}`, net_to_company_cents: net, days_unfunded: 0 };
}
function wire(id: string, date: string, amount: number, merchant = "Faro"): WireRow {
  return { id, transaction_date: date, amount_cents: amount, description: "WIRE TYPE:WIRE IN", merchant_name: merchant };
}

describe("ACCT-F11071 wire window is anchored on purchase dates, never as_of", () => {
  it("covers the oldest purchase minus 14 days through the newest plus 14", () => {
    expect(wireWindowForPurchases([purchase("a", "2026-08-17", 1), purchase("b", "2026-09-04", 1)])).toEqual({
      from: "2026-08-03",
      to: "2026-09-18",
    });
  });
  it("is null with no open purchase (no wire read)", () => {
    expect(wireWindowForPurchases([])).toBeNull();
  });
});

describe("ACCT-F11071 buildFaro1090WireProposals", () => {
  it("PROPOSED for the same-day exact wire (FP-2026-00013 shape: 687,700 on 08-17)", () => {
    const { proposals, summary } = buildFaro1090WireProposals([purchase("FP13", "2026-08-17", 687_700)], [wire("w1", "2026-08-17", 687_700)]);
    expect(proposals[0]!.classification).toBe("PROPOSED");
    expect(proposals[0]!.dry_run_accept_preview.bank_transaction_id).toBe("w1");
    expect(proposals[0]!.dry_run_accept_preview.executed).toBe(false);
    expect(summary).toEqual({ PROPOSED: 1, AMBIGUOUS: 0, NO_EVIDENCE: 0 });
  });

  it("a wire 15 days away is outside the window (FP-2026-00019 299,700 vs the 09-10 repeat)", () => {
    const { proposals } = buildFaro1090WireProposals(
      [purchase("FP19", "2026-08-26", 299_700)],
      [wire("w0826", "2026-08-26", 299_700), wire("w0910", "2026-09-10", 299_700)],
    );
    expect(proposals[0]!.classification).toBe("PROPOSED");
    expect(proposals[0]!.candidates.map((c) => c.bank_transaction_id)).toEqual(["w0826"]);
  });

  it("a wire that is the exact candidate of two purchases is AMBIGUOUS for both", () => {
    const { proposals } = buildFaro1090WireProposals(
      [purchase("a", "2026-08-10", 100_00), purchase("b", "2026-08-12", 100_00)],
      [wire("w", "2026-08-11", 100_00)],
    );
    expect(proposals.map((p) => p.classification)).toEqual(["AMBIGUOUS", "AMBIGUOUS"]);
    expect(proposals.every((p) => p.dry_run_accept_preview.bank_transaction_id === null)).toBe(true);
  });

  it("a lone near (1-cent) candidate is AMBIGUOUS, never PROPOSED", () => {
    const { proposals } = buildFaro1090WireProposals([purchase("a", "2026-08-10", 100_00)], [wire("w", "2026-08-10", 100_01)]);
    expect(proposals[0]!.classification).toBe("AMBIGUOUS");
  });

  it("a same-day Faro SHORT wire is offered as AMBIGUOUS evidence with the gap (FP-2026-00018: 547,050 vs 367,050)", () => {
    const { proposals } = buildFaro1090WireProposals([purchase("FP18", "2026-08-13", 547_050)], [wire("w", "2026-08-13", 367_050)]);
    const p = proposals[0]!;
    expect(p.classification).toBe("AMBIGUOUS");
    expect(p.candidates[0]).toMatchObject({ short_wire: true, exact_amount: false, amount_delta_cents: 180_000 });
    expect(p.dry_run_accept_preview.bank_transaction_id).toBeNull();
  });

  it("a short wire is never offered when it is another purchase's exact wire, or does not name Faro", () => {
    const { proposals } = buildFaro1090WireProposals(
      [purchase("big", "2026-08-13", 547_050), purchase("small", "2026-08-13", 367_050)],
      [wire("w", "2026-08-13", 367_050), wire("x", "2026-08-13", 100_00, "ACME BROKER")],
    );
    expect(proposals.find((p) => p.purchase_id === "big")!.classification).toBe("NO_EVIDENCE");
    expect(proposals.find((p) => p.purchase_id === "small")!.classification).toBe("PROPOSED");
  });
});
