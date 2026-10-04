export default {
  name: "verify:wo-linked-expense-human-labels",
  run(ctx) {
    ctx.run("node", ["scripts/verify-wo-linked-expense-human-labels.mjs"]);
  },
};
