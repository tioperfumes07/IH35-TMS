import { describe, expect, it } from "vitest";
import { nextLaneStats, plannedLegMiles } from "../load-lane-learning.service.js";

// ROUND 443.35: every booked load saves its miles — leg_miles per stop and a running lane average.

describe("plannedLegMiles", () => {
  const two = [{ sequence_number: 1 }, { sequence_number: 2 }];
  it("2-stop load: stop 1 = deadhead, stop 2 = loaded miles", () => {
    expect(plannedLegMiles(two, { miles_deadhead: 353.2, loaded_miles: 1574.8 }, () => null)).toEqual([353.2, 1574.8]);
  });
  it("unknown deadhead stays NULL — never 0", () => {
    expect(plannedLegMiles(two, { miles_deadhead: null, loaded_miles: 1890.2 }, () => null)).toEqual([null, 1890.2]);
  });
  it("multi-stop legs come from the point cache, else stay NULL (never the load total)", () => {
    const three = [{ sequence_number: 1 }, { sequence_number: 2 }, { sequence_number: 3 }];
    expect(plannedLegMiles(three, { miles_deadhead: 10, loaded_miles: 900 }, (i) => (i === 1 ? 400 : null))).toEqual([10, 400, null]);
  });
});

describe("nextLaneStats", () => {
  const row = { practical_miles: 1000, n_practical: 3, short_miles: null, n_short: 0, empty_miles: 20, practical_min: 990, practical_max: 1010 };
  it("running practical average, count, min/max/spread, empty average", () => {
    expect(nextLaneStats(row, { practical: 1040, short: null, empty: 60 })).toMatchObject({
      practical_miles: 1010, n_practical: 4, practical_min: 990, practical_max: 1040, practical_spread: 50, empty_miles: 30, short_miles: null, n_short: 0,
    });
  });
  it("shortest joins its own average only while it stays <= practical", () => {
    expect(nextLaneStats(row, { practical: 1040, short: 950, empty: 0 })).toMatchObject({ short_miles: 950, n_short: 1 });
    expect(nextLaneStats({ ...row, practical_miles: 100, practical_min: 100, practical_max: 100 }, { practical: 100, short: 400, empty: 0 })).toMatchObject({ short_miles: null, n_short: 0 });
  });
});
