export default {
  name: "verify-accounting-query-error-states-wave-b",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-accounting-query-error-states-wave-b.mjs"]) !== 0) {
      return 1;
    }
    return ctx.run("node", ["scripts/verify-accounting-query-error-states-wave-b.mjs", "--selftest"]);
  },
};
