import { test } from "@playwright/test";

test.describe("sidebar visual baselines", () => {
  test.skip(true, "TODO(P3-T11.18): visual snapshots blocked until authenticated module routes are scripted.");

  test("captures sidebar active-state snapshots", async () => {
    // TODO(P3-T11.18): capture 15 module active snapshots with toHaveScreenshot.
  });
});
