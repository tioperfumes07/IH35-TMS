export default {
  name: "verify-expense-detail-route",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-expense-detail-route.mjs"]) !== 0) {
      return 1;
    }
    return ctx.run("node", ["scripts/verify-expense-detail-route.mjs", "--selftest"]);
  },
};
