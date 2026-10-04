export default {
  name: "verify:recent-activity-ledger-sourced",
  run(ctx) {
    ctx.run("node", ["scripts/verify-recent-activity-ledger-sourced.mjs"]);
  },
};
