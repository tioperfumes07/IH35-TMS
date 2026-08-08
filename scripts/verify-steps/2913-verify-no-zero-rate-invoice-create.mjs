export default {
  name: "verify:no-zero-rate-invoice-create",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-zero-rate-invoice-create.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-no-zero-rate-invoice-create.mjs"]);
  },
};
