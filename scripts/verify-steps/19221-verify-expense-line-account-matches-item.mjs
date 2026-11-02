export default {
  name: "verify:expense-line-account-matches-item",
  run(ctx) {
    ctx.run("node", ["scripts/verify-expense-line-account-matches-item.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-expense-line-account-matches-item.mjs"]);
  },
};
