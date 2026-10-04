export default {
  name: "verify:factoring-summary-dollars-unit",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-summary-dollars-unit.mjs"]);
  },
};
