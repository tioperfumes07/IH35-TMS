export default {
  name: "verify:wo-auto-bill-expense-stamps-unit-id",
  run(ctx) {
    ctx.run("node", ["scripts/verify-wo-auto-bill-expense-stamps-unit-id.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-wo-auto-bill-expense-stamps-unit-id.mjs"]);
  },
};
