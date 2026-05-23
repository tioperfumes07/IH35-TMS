import { describe, expect, it } from "vitest";
import { deriveProgressStatus } from "../load-progress.service.js";

describe("load progress threshold boundaries", () => {
  it("classifies each threshold band correctly", () => {
    expect(deriveProgressStatus(-31)).toBe("early");
    expect(deriveProgressStatus(-30)).toBe("on_track");
    expect(deriveProgressStatus(15)).toBe("on_track");
    expect(deriveProgressStatus(16)).toBe("behind");
    expect(deriveProgressStatus(60)).toBe("behind");
    expect(deriveProgressStatus(61)).toBe("delayed");
  });
});
