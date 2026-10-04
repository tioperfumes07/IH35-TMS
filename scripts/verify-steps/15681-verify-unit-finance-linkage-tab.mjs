export default {
  name: "verify:unit-finance-linkage-tab",
  run(ctx) {
    ctx.run("node", ["scripts/verify-unit-finance-linkage-tab.mjs"]);
  },
};
