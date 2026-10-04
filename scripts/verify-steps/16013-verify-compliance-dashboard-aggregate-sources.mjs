export default {
  name: "verify:compliance-dashboard-aggregate-sources",
  run(ctx) {
    ctx.run("node", ["scripts/verify-compliance-dashboard-aggregate-sources.mjs"]);
  },
};
