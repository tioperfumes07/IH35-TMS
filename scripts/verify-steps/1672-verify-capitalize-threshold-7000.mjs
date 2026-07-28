// Rule 17 — ND-FA-01 $7,000 capitalize threshold pin (verify-steps only).
export default {
  name: "capitalize-threshold-7000",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-capitalize-threshold-7000.mjs", "--selftest"]) !== 0) return 1;
    if (ctx.run("node", ["scripts/verify-capitalize-threshold-7000.mjs"]) !== 0) return 1;
    return 0;
  },
};
