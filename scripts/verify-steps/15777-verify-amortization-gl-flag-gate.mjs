export default {
  name: "verify:amortization-gl-flag-gate",
  run(ctx) {
    ctx.run("node", ["scripts/verify-amortization-gl-flag-gate.mjs"]);
  },
};
