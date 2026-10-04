export default {
  name: "verify:expense-gl-posting",
  run(ctx) {
    ctx.run("node", ["scripts/verify-expense-gl-posting.mjs"]);
  },
};
