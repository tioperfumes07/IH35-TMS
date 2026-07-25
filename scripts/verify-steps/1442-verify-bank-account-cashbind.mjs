export default {
  name: "verify-bank-account-cashbind",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-bank-account-cashbind.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-bank-account-cashbind.mjs"]);
  },
};
