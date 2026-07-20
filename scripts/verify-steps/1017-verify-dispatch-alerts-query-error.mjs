export default {
  name: "verify:dispatch-alerts-query-error",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-alerts-query-error.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-dispatch-alerts-query-error.mjs"]);
  },
};
