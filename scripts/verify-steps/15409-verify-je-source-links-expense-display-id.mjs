export default {
  name: "verify:je-source-links-expense-display-id",
  run(ctx) {
    ctx.run("node", ["scripts/verify-je-source-links-expense-display-id.mjs"]);
  },
};
