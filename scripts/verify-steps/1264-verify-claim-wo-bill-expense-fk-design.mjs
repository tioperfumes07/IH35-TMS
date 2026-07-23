/** Rule 17: verify-step wrapper — do not edit package.json / locked-guards / ci.yml. */
export default {
  name: "verify-claim-wo-bill-expense-fk-design",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-claim-wo-bill-expense-fk-design.mjs"]);
  },
};
