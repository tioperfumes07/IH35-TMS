import { describe, expect, it } from "vitest";
import {
  AUDIT_ACTIVITY_PENDING,
  FEATURE_BEING_PREPARED,
  NOT_AVAILABLE_YET,
  OFFLINE_PREVIEW_BANNER,
} from "./prodEmptyStateCopy";

describe("prodEmptyStateCopy", () => {
  it("uses operator-safe phrases without stub leaks", () => {
    for (const copy of [FEATURE_BEING_PREPARED, OFFLINE_PREVIEW_BANNER, NOT_AVAILABLE_YET, AUDIT_ACTIVITY_PENDING]) {
      expect(copy.toLowerCase()).not.toMatch(/stub|coming soon|lorem|todo/);
    }
  });

  it("empty-state banner is non-empty", () => {
    expect(FEATURE_BEING_PREPARED.length).toBeGreaterThan(10);
  });
});
