export default {
  name: "verify:bank-deposit-receives-several-invoices",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bank-deposit-receives-several-invoices.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-bank-deposit-receives-several-invoices.mjs"]);
  },
};
