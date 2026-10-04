export default {
  name: "verify:load-profitability-card-wired",
  run(ctx) {
    ctx.run("node", ["scripts/verify-load-profitability-card-wired.mjs"]);
  },
};
