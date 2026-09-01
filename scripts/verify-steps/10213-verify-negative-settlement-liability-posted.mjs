// RULING B — negative settlements post to driver_liabilities (owner ruling 2026-09-01). Step 10213 · CC-1 lane.
export default {
  name: "negative-settlement-liability-posted",
  run(ctx) {
    ctx.run("node", ["scripts/verify-negative-settlement-liability-posted.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-negative-settlement-liability-posted.mjs"]);
  },
};
