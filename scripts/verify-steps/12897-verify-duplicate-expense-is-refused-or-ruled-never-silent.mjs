export default {
  name: "verify:duplicate-expense-is-refused-or-ruled-never-silent",
  run(ctx) {
    ctx.run("node", ["scripts/verify-duplicate-expense-is-refused-or-ruled-never-silent.mjs"]);
  },
};
