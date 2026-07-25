export default {
  name: "verify:acct-wizard-picker-matrix",
  run(ctx) {
    ctx.run("node", ["scripts/verify-acct-wizard-picker-matrix.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-acct-wizard-picker-matrix.mjs"]);
  },
};
