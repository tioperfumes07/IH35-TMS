export default {
  name: "verify:acct-expense-list-wo-reverse",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-acct-expense-list-wo-reverse.mjs"]);
  },
};
