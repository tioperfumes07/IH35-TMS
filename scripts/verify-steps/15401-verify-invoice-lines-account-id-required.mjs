export default {
  name: "verify:invoice-lines-account-id-required",
  run(ctx) {
    ctx.run("node", ["scripts/verify-invoice-lines-account-id-required.mjs"]);
  },
};
