export default {
  name: "verify:revrec-latch-fires-on-bulk-invoice-issuance",
  run(ctx) {
    ctx.run("node", ["scripts/verify-revrec-latch-fires-on-bulk-invoice-issuance.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-revrec-latch-fires-on-bulk-invoice-issuance.mjs"]);
  },
};
