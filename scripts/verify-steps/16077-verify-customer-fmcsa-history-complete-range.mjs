export default {
  name: "verify:customer-fmcsa-history-complete-range",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customer-fmcsa-history-complete-range.mjs"]);
  },
};
