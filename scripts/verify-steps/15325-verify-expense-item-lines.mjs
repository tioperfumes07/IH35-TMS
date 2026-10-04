export default {
  name: "verify:expense-item-lines",
  run(ctx) {
    ctx.run("node", ["scripts/verify-expense-item-lines.mjs"]);
  },
};
