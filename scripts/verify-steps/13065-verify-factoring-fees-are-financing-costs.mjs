export default {
  name: "verify:factoring-fees-are-financing-costs",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-fees-are-financing-costs.mjs"]);
  },
};
