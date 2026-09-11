export default {
  name: "verify:bank-sign-convention-per-account-audit",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bank-sign-convention-per-account-audit.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-bank-sign-convention-per-account-audit.mjs"]);
  },
};
