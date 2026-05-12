import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      ({
        ok: true,
        status: 200,
        headers: {
          get: () => "application/json",
        },
        json: async () => [],
        text: async () => "[]",
      }) as unknown as Response
    )
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
