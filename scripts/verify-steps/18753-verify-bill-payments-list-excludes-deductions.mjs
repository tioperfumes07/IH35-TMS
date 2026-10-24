export default {
  name: "verify-bill-payments-list-excludes-deductions",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-bill-payments-list-excludes-deductions.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-bill-payments-list-excludes-deductions.mjs"]);
  },
};
