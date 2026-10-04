export default {
  name: "verify:uncategorized-expense-mapping",
  run(ctx) {
    ctx.run("node", ["scripts/verify-uncategorized-expense-mapping.mjs"]);
  },
};
