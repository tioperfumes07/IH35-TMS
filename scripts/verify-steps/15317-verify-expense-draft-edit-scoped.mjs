export default {
  name: "verify:expense-draft-edit-scoped",
  run(ctx) {
    ctx.run("node", ["scripts/verify-expense-draft-edit-scoped.mjs"]);
  },
};
