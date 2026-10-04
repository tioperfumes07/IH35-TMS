export default {
  name: "verify:settlement-payrun-gl-flag-gate",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlement-payrun-gl-flag-gate.mjs"]);
  },
};
