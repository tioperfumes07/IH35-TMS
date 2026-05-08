import { test } from "@playwright/test";

test.describe("work order create flow", () => {
  test.skip(true, "TODO(P3-T11.18): requires stable auth/session bypass + deterministic seed data in e2e env.");

  test("creates work order with section A/B and map selection", async () => {
    // TODO(P3-T11.18): implement once auth/session bypass is available for CI/local deterministic runs.
  });
});
