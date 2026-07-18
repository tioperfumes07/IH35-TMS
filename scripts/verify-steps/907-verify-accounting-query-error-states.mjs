export default {
  name: "verify-accounting-query-error-states",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-accounting-query-error-states.mjs"]) !== 0) {
      return 1;
    }
    return ctx.run("node", ["scripts/verify-accounting-query-error-states.mjs", "--selftest"]);
  },
};
