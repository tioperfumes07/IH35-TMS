export default {
  name: "verify:expense-create-modal-catalog",
  run(ctx) {
    ctx.run("node", ["scripts/verify-expense-create-modal-catalog.mjs"]);
  },
};
