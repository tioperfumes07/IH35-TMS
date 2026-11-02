export default {
  name: "verify:customer-load-history-complete-range",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customer-load-history-complete-range.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-customer-load-history-complete-range.mjs"]);
  },
};
