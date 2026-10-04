export default {
  name: "verify:maintenance-wo-lines-status-history-rls",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maintenance-wo-lines-status-history-rls.mjs"]);
  },
};
