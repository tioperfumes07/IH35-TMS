// verify-steps wrapper — FROM-LOAD-INVOICE-ZERO-RATE-SNAPSHOT · claim 3640
export default {
  name: "verify-from-load-invoice-no-zero-rate",
  run(ctx) {
    ctx.run("node", ["scripts/verify-from-load-invoice-no-zero-rate.mjs"]);
  },
};
