import { test } from "@playwright/test";

test.describe("accident create flow", () => {
  test.skip(true, "TODO(P3-T11.18): blocked on auth/session + stable route state for safety accident drawer.");

  test("opens map modal and supports multi-select", async () => {
    // TODO(P3-T11.18): add interaction and totals assertions with authenticated fixture.
  });
});
