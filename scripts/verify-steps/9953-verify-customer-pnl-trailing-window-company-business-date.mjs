export default {
  name: "verify:customer-pnl-trailing-window-company-business-date",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customer-pnl-trailing-window-company-business-date.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-customer-pnl-trailing-window-company-business-date.mjs"]);
  },
};
