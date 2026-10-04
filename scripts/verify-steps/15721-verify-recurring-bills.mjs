export default {
  name: "verify:recurring-bills",
  run(ctx) {
    ctx.run("node", ["scripts/verify-recurring-bills.mjs"]);
  },
};
