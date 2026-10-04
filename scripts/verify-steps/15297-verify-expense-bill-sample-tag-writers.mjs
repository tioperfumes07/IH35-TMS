export default {
  name: "verify:expense-bill-sample-tag-writers",
  run(ctx) {
    ctx.run("node", ["scripts/verify-expense-bill-sample-tag-writers.mjs"]);
  },
};
