import * as matchers from "@testing-library/jest-dom/matchers";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, vi } from "vitest";

expect.extend(matchers);

// jsdom does not implement scrollIntoView; stub it globally to prevent
// unhandled errors from components that call it after async operations.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

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
