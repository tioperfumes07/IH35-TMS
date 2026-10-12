import { run } from "../verify-catalog-config-physical-columns.mjs";

// 443.99 (2026-10-12): run() returns the failures ARRAY. This wrapper destructured `{ ok, message }` from it and called
// a `ctx.pass` the context never exposed, so `ok` was always undefined and the step always failed with "undefined" —
// red whether the guard passed or not, i.e. it measured nothing. It now fails on the guard's real failures only.
export default {
  name: "verify-catalog-config-physical-columns",
  async run(ctx) {
    const failures = run();
    if (failures.length) {
      ctx.fail(`verify-catalog-config-physical-columns FAIL:\n  - ${failures.join("\n  - ")}`);
    }
    console.log("verify-catalog-config-physical-columns PASS — every catalog config declares hasDeactivatedAt; every deactivated_at SQL reference in the factory is gated on it");
  },
};
