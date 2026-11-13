#!/usr/bin/env node
/** verify-step 20162 — Factoring reserve history prefers profile id */
export default {
  name: "verify-factoring-reserve-history-prefers-profile",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-reserve-history-prefers-profile.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-factoring-reserve-history-prefers-profile.mjs"]);
  },
};
