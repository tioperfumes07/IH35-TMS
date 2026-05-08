import { test } from "@playwright/test";

test.describe("expense create flow", () => {
  test.skip(true, "TODO(P3-T11.18): blocked on auth/session fixture for opening modal-backed expense forms.");

  test("renders fuel expense default without MPG/ODO columns", async () => {
    // TODO(P3-T11.18): add assertions for 6-column section B once route harness is available.
  });
});
