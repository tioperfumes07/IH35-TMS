export default {
  name: "verify-bank-account-cashbind",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-bank-account-cashbind.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-bank-account-cashbind.mjs"]);
    ctx.run("node", ["scripts/verify-faro-usmca-digital-bank-account.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-faro-usmca-digital-bank-account.mjs"]);
  },
};
