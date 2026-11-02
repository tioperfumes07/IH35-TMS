export default {
  name: "verify:customer-financial-history-complete-range",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customer-financial-history-complete-range.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-customer-financial-history-complete-range.mjs"]);
  },
};
