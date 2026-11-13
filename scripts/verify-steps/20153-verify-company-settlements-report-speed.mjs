#!/usr/bin/env node
/**
 * verify-step 20153 — company-settlements-report-speed-lt-2s
 * Wires scripts/verify-company-settlements-report-speed.mjs into CI (orphan unblock).
 * CC-3 BOARD 29: closed tours batch path + migration indexes.
 */
export default {
  name: "verify-company-settlements-report-speed",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-company-settlements-report-speed.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-company-settlements-report-speed.mjs"]);
  },
};
