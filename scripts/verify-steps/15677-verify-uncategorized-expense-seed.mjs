export default {
  name: "verify:uncategorized-expense-seed",
  run(ctx) {
    ctx.run("node", ["scripts/verify-uncategorized-expense-seed.mjs"]);
  },
};
