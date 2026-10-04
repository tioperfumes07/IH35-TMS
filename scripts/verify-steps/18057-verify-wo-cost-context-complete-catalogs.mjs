export default {
  name: "verify:wo-cost-context-complete-catalogs",
  run(ctx) {
    ctx.run("node", ["scripts/verify-wo-cost-context-complete-catalogs.mjs"]);
  },
};
