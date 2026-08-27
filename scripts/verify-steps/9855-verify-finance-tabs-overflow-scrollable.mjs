export default {
  name: "verify:finance-tabs-overflow-scrollable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-finance-tabs-overflow-scrollable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-finance-tabs-overflow-scrollable.mjs"]);
  },
};
