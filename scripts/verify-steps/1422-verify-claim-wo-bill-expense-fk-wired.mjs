export default {
  name: "verify:claim-wo-bill-expense-fk-wired",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-claim-wo-bill-expense-fk-wired.mjs"]);
  },
};
