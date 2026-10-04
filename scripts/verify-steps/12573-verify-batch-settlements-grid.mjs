export default {
  name: "verify:batch-settlements-grid",
  run(ctx) {
    ctx.run("node", ["scripts/verify-batch-settlements-grid.mjs"]);
  },
};
