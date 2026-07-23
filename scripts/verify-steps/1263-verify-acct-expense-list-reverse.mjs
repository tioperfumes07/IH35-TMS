export default {
  name: "verify-acct-expense-list-reverse",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-acct-expense-list-reverse.mjs"]) !== 0) {
      return 1;
    }
    return ctx.run("node", ["scripts/verify-acct-expense-list-reverse.mjs", "--selftest"]);
  },
};
