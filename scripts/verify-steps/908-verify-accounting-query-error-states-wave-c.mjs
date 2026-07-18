export default {
  name: "verify-accounting-query-error-states-wave-c",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-accounting-query-error-states-wave-c.mjs"]) !== 0) return 1;
    return ctx.run("node", ["scripts/verify-accounting-query-error-states-wave-c.mjs", "--selftest"]);
  },
};
