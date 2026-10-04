export default {
  name: "verify:no-zero-rate-invoice-from-load",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-zero-rate-invoice-from-load.mjs"]);
  },
};
