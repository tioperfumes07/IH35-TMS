export default {
  name: "verify:finance-hub-off-honest-state",
  run(ctx) {
    ctx.run("node", ["scripts/verify-finance-hub-off-honest-state.mjs"]);
  },
};
