export default {
  name: "verify-acct-invoice-create-coa",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-acct-invoice-create-coa.mjs"]);
  },
};
