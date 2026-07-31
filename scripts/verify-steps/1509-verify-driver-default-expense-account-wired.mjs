export default {
  name: "verify:driver-default-expense-account-wired",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-default-expense-account-wired.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-default-expense-account-wired.mjs"]);
  },
};
