import { describe, expect, it } from "vitest";
import { buildOverageStatusParam, parseOverageStatusParam } from "./CardOverageQueuePage";

describe("ROUND 8.20 board19 card-overage status URL SoT", () => {
  it("defaults pending_review when status absent", () => {
    expect(parseOverageStatusParam(null)).toEqual(["pending_review"]);
    expect(parseOverageStatusParam("")).toEqual(["pending_review"]);
  });

  it("parses comma cohorts and all", () => {
    expect(parseOverageStatusParam("approved,posted")).toEqual(["approved", "posted"]);
    expect(parseOverageStatusParam("all")).toEqual([]);
  });

  it("omits default pending_review from URL; encodes all/multi", () => {
    expect(buildOverageStatusParam(["pending_review"])).toBeNull();
    expect(buildOverageStatusParam([])).toBe("all");
    expect(buildOverageStatusParam(["approved", "posted"])).toBe("approved,posted");
  });
});
