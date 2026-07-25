export default {
  name: "verify-bank-surfaces-and-counterparty",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bank-surfaces-and-counterparty.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-bank-surfaces-and-counterparty.mjs"]);
  },
};
