import * as matchers from "@testing-library/jest-dom/matchers";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, vi } from "vitest";

expect.extend(matchers);

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
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
