export default {
  name: "verify:expense-create-duplicate-submission-guard",
  run(ctx) {
    ctx.run("node", ["scripts/verify-expense-create-duplicate-submission-guard.mjs"]);
  },
};
