import { describe, expect, it } from "vitest";
import {
  computeEligibleReleaseDate,
  computeNetEscrowReturn,
  daysUntilEligible,
  isEligibleForRelease,
  parseDateOnly,
} from "../escrow-separation.math.js";

describe("BLOCK-02 driver escrow separation math", () => {
  it("computes eligible_release_date as separation_date + 90 days", () => {
    expect(computeEligibleReleaseDate("2026-01-01").toISOString().slice(0, 10)).toBe("2026-04-01");
    expect(computeEligibleReleaseDate("2026-06-12").toISOString().slice(0, 10)).toBe("2026-09-10");
  });

  it("parses a date-only string without a timezone shift", () => {
    expect(parseDateOnly("2026-06-12").toISOString().slice(0, 10)).toBe("2026-06-12");
    expect(parseDateOnly("2026-06-12T00:00:00.000Z").toISOString().slice(0, 10)).toBe("2026-06-12");
  });

  it("is NOT eligible before day 90", () => {
    const eligible = computeEligibleReleaseDate("2026-01-01"); // 2026-04-01
    const oneDayBefore = new Date(Date.UTC(2026, 2, 31));
    expect(isEligibleForRelease(eligible, oneDayBefore)).toBe(false);
    expect(daysUntilEligible(eligible, oneDayBefore)).toBe(1);
  });

  it("IS eligible exactly on day 90 and after", () => {
    const eligible = computeEligibleReleaseDate("2026-01-01"); // 2026-04-01
    expect(isEligibleForRelease(eligible, new Date(Date.UTC(2026, 3, 1)))).toBe(true);
    expect(isEligibleForRelease(eligible, new Date(Date.UTC(2026, 3, 2)))).toBe(true);
    expect(daysUntilEligible(eligible, new Date(Date.UTC(2026, 3, 1)))).toBe(0);
  });

  it("releases the full balance when there are no outstanding damage claims", () => {
    const net = computeNetEscrowReturn(50000, 0);
    expect(net).toEqual({
      balance_cents: 50000,
      outstanding_damage_claims_cents: 0,
      net_release_cents: 50000,
      retained_for_damages_cents: 0,
    });
  });

  it("nets outstanding damage claims against the balance before releasing to the driver", () => {
    const net = computeNetEscrowReturn(50000, 20000);
    expect(net.net_release_cents).toBe(30000);
    expect(net.retained_for_damages_cents).toBe(20000);
  });

  it("caps retained-for-damages at the available balance (never goes negative)", () => {
    const net = computeNetEscrowReturn(10000, 999999);
    expect(net.retained_for_damages_cents).toBe(10000);
    expect(net.net_release_cents).toBe(0);
  });

  it("never returns a negative net release for a zero/negative balance", () => {
    expect(computeNetEscrowReturn(0, 500).net_release_cents).toBe(0);
    expect(computeNetEscrowReturn(-100, 0).balance_cents).toBe(0);
  });
});
