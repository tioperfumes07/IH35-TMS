export default {
  name: "verify:factored-invoice-amount-locked",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factored-invoice-amount-locked.mjs"]);
  },
};
