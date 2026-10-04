export default {
  name: "verify:record-expense-driverless-posting",
  run(ctx) {
    ctx.run("node", ["scripts/verify-record-expense-driverless-posting.mjs"]);
  },
};
