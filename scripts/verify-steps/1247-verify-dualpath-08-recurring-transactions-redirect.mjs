export default {
  name: "verify-dualpath-08-recurring-transactions-redirect",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dualpath-08-recurring-transactions-redirect.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-dualpath-08-recurring-transactions-redirect.mjs"]);
  },
};
