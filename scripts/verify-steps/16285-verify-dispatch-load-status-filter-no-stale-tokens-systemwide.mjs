export default {
  name: "verify:dispatch-load-status-filter-no-stale-tokens-systemwide",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-load-status-filter-no-stale-tokens-systemwide.mjs"]);
  },
};
