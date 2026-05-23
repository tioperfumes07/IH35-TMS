import { describe, expect, it } from "vitest";
import { shouldTriggerPmAlert } from "../maintenance-predictor.service.js";

describe("maintenance predictor threshold trigger", () => {
  it("opens alert when lookahead reaches threshold", () => {
    expect(shouldTriggerPmAlert(9950, 500, 10000)).toBe(true);
    expect(shouldTriggerPmAlert(9400, 500, 10000)).toBe(false);
  });
});
