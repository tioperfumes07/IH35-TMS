export default {
  name: "verify:dispatch-load-status-filter-enum-mismatch-400",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-load-status-filter-enum-mismatch-400.mjs"]);
  },
};
