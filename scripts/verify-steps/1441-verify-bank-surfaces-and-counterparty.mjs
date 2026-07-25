export default {
  name: "verify-bank-surfaces-and-counterparty",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-bank-surfaces-and-counterparty.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-bank-surfaces-and-counterparty.mjs"]);
  },
};
