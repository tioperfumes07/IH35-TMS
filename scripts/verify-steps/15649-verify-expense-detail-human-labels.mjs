export default {
  name: "verify:expense-detail-human-labels",
  run(ctx) {
    ctx.run("node", ["scripts/verify-expense-detail-human-labels.mjs"]);
  },
};
