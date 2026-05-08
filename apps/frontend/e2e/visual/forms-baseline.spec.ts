import { test } from "@playwright/test";

test.describe("forms visual baselines", () => {
  test.skip(true, "TODO(P3-T11.18): visual baselines deferred until authenticated e2e harness lands.");

  test("captures WO/Bill/Expense/Accident default states", async () => {
    // TODO(P3-T11.18): take toHaveScreenshot baselines after auth harness is in place.
  });
});
