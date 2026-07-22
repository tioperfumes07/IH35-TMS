export default {
  name: "verify:driver-default-expense-account-held",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-default-expense-account-held.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-default-expense-account-held.mjs"]);
  },
};
