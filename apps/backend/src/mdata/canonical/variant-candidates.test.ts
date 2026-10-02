import { describe, expect, it } from "vitest";
import { matchParties, partyTokens, variantPairs, type PartyRecord } from "./variant-candidates.js";

// ROUND 297 — the owner's own live examples must be proposed; unrelated parties must not.
describe("variant duplicate candidates", () => {
  it("normalises spaced initials, legal suffixes and plurals", () => {
    expect(partyTokens("S E Mares Forwarding Service LLC")).toEqual(["semares", "forwarding", "service"]);
    expect(partyTokens("Semares Forwarding Services")).toEqual(["semares", "forwarding", "services"]);
  });

  it.each([
    ["S E Mares Forwarding Service LLC", "Semares Forwarding Services"],
    ["DARDINI LLC", "DLS Dardini Logistics Services"],
    ["FLS TRANSPORTATION SERVICES LIMITED", "FLS Transport Inc."],
    ["Blue Beacon Truck Wash", "BLUEBEACON"],
    ["CTS EXPRESS LLC", "CTS XPRESS LLC"],
    ["PILOT", "PILOTMBRIDGE,OH"],
  ])("proposes %s ~ %s", (a, b) => {
    expect(matchParties(a, b)).not.toBeNull();
  });

  it.each([
    ["Swift Transportation", "Knight Transportation"],
    ["ABC Logistics LLC", "XYZ Logistics LLC"],
    ["Loves Travel Stops", "Pilot Travel Centers"],
    ["J B Hunt Transport", "C H Robinson Worldwide"],
  ])("does not propose %s ~ %s", (a, b) => {
    expect(matchParties(a, b)).toBeNull();
  });

  it("pairs carry both records' numbers and flag only same-kind uuid pairs as mergeable", () => {
    const parties: PartyRecord[] = [
      { kind: "customer", id: "c1", name: "S E Mares Forwarding Service LLC", docs: 3, total_cents: 1470000, open_cents: 0 },
      { kind: "customer", id: "c2", name: "Semares Forwarding Services", docs: 11, total_cents: 5390000, open_cents: 0 },
      { kind: "factoring_debtor", id: "CTS XPRESS LLC", name: "CTS XPRESS LLC", docs: 1, total_cents: 400000, open_cents: 0 },
      { kind: "customer", id: "c3", name: "CTS EXPRESS LLC", docs: 1, total_cents: 400000, open_cents: 0 },
    ];
    const pairs = variantPairs(parties, (n) => n.toUpperCase().replace(/[^A-Z0-9]/g, ""));
    const semares = pairs.find((p) => p.a.id === "c1" && p.b.id === "c2")!;
    expect(semares.mergeable).toBe(true);
    expect(semares.a.total_cents + semares.b.total_cents).toBe(6860000); // $68,600 split in two
    const cts = pairs.find((p) => [p.a.id, p.b.id].includes("c3"))!;
    expect(cts.mergeable).toBe(false); // customer ~ factoring debtor: cross-module, linked not merged
  });
});
