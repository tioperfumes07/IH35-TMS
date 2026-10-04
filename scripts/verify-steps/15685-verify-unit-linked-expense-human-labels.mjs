export default {
  name: "verify:unit-linked-expense-human-labels",
  run(ctx) {
    ctx.run("node", ["scripts/verify-unit-linked-expense-human-labels.mjs"]);
  },
};
