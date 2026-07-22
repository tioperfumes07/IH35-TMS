export default {
  name: "verify-expense-reverse-routes",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-expense-reverse-routes.mjs"]) !== 0) {
      return 1;
    }
    return ctx.run("node", ["scripts/verify-expense-reverse-routes.mjs", "--selftest"]);
  },
};
