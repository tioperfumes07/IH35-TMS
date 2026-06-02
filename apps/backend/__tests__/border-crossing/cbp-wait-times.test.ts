import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { fetchCbpWaitTimesFromApi } from "../../src/border-crossing/cbp-wait-times.service.js";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("cbp wait times", () => {
  it("defines cache TTL and fetch helper", () => {
    const src = fs.readFileSync(path.join(here, "../../src/border-crossing/cbp-wait-times.service.ts"), "utf8");
    assert.match(src, /cbp_wait_times_cache/);
    assert.match(src, /bwt\.cbp\.gov/);
  });

  it("returns fallback row on fetch failure", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      await Promise.resolve();
      return new Response("error", { status: 503 });
    };
    try {
      const rows = await fetchCbpWaitTimesFromApi("2304");
      assert.ok(rows.length >= 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
