export default {
  name: "verify:cash-flow-void-exclusion",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cash-flow-void-exclusion.mjs"]);
  },
};
