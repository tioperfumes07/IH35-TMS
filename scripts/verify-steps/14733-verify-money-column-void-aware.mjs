export default {
  name: "verify:money-column-void-aware",
  run(ctx) {
    ctx.run("node", ["scripts/verify-money-column-void-aware.mjs"]);
  },
};
