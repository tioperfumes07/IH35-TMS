export default {
  name: "verify:lane-profitability-cache-rls",
  run(ctx) {
    ctx.run("node", ["scripts/verify-lane-profitability-cache-rls.mjs"]);
  },
};
