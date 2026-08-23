export default {
  name: "verify:banking-bank-accounts-mask-column",
  run(ctx) {
    ctx.run("node", ["scripts/verify-banking-bank-accounts-mask-column.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-banking-bank-accounts-mask-column.mjs"]);
  },
};
