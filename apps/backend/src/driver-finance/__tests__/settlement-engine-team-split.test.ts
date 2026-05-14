import { describe, expect, it } from "vitest";
import { effectiveTeamPercentsFromRow, splitTotalCents } from "../settlement-engine.js";

describe("settlement-engine team splits", () => {
  it("splits 50/50 with residual on primary", () => {
    expect(splitTotalCents(101, 50, 50)).toEqual({ primaryCents: 51, secondaryCents: 50 });
    expect(splitTotalCents(100, 50, 50)).toEqual({ primaryCents: 50, secondaryCents: 50 });
  });

  it("splits 60/40", () => {
    expect(splitTotalCents(1000, 60, 40)).toEqual({ primaryCents: 600, secondaryCents: 400 });
    expect(splitTotalCents(1001, 60, 40)).toEqual({ primaryCents: 601, secondaryCents: 400 });
  });

  it("splits 70/30", () => {
    expect(splitTotalCents(3333, 70, 30)).toEqual({ primaryCents: 2333, secondaryCents: 1000 });
  });

  it("maps preset split methods to effective percentages", () => {
    expect(effectiveTeamPercentsFromRow({ split_method: "50_50", primary_share_pct: 1, co_share_pct: 99 })).toEqual({
      primaryPct: 50,
      secondaryPct: 50,
    });
    expect(effectiveTeamPercentsFromRow({ split_method: "60_40", primary_share_pct: 1, co_share_pct: 99 })).toEqual({
      primaryPct: 60,
      secondaryPct: 40,
    });
    expect(effectiveTeamPercentsFromRow({ split_method: "70_30", primary_share_pct: 1, co_share_pct: 99 })).toEqual({
      primaryPct: 70,
      secondaryPct: 30,
    });
  });

  it("uses custom percentages when split_method is custom", () => {
    expect(effectiveTeamPercentsFromRow({ split_method: "custom", primary_share_pct: 55.5, co_share_pct: 44.5 })).toEqual({
      primaryPct: 55.5,
      secondaryPct: 44.5,
    });
  });
});
