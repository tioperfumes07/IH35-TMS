export default {
  name: "verify:home-record-expense-modal",
  run(ctx) {
    ctx.run("node", ["scripts/verify-home-record-expense-modal.mjs"]);
  },
};
