export default {
  name: "verify:settlement-gl-flag-gate",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlement-gl-flag-gate.mjs"]);
  },
};
