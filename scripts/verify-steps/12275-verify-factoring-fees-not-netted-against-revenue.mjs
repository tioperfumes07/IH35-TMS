export default {
  name: "verify:factoring-fees-not-netted-against-revenue",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-fees-not-netted-against-revenue.mjs"]);
  },
};
