import { test } from "@playwright/test";

test.describe("location map visual baselines", () => {
  test.skip(true, "TODO(P3-T11.18): deferred until test auth/session and modal routing harness is available.");

  test("captures tractor/trailer/selected-state map snapshots", async () => {
    // TODO(P3-T11.18): capture baseline PNGs once e2e harness can open modal deterministically.
  });
});
