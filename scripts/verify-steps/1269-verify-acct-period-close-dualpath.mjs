export default {
  name: "verify-acct-period-close-dualpath",
  run(ctx) {
    ctx.run("node", ["scripts/verify-acct-period-close-dualpath.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-acct-period-close-dualpath.mjs"]);
  },
};
