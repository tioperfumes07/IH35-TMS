export default {
  name: "verify:plaid-status-derived-from-state",
  run(ctx) {
    ctx.run("node", ["scripts/verify-plaid-status-derived-from-state.mjs"]);
  },
};
