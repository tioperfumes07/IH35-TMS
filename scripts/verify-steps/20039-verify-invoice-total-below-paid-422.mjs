export default {
  name: "verify:invoice-total-below-paid-422",
  run(ctx) {
    ctx.run("node", ["scripts/verify-invoice-total-below-paid-422.mjs"]);
    ctx.run("node", ["scripts/verify-invoice-total-below-paid-422.mjs", "--selftest"]);
  },
};
