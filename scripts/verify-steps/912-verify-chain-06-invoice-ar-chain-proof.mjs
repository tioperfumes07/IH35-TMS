export default {
  name: "verify-chain-06-invoice-ar-chain-proof",
  run(ctx) {
    // Fail closed: nonzero child exit must terminate the step (Rule 18).
    if (ctx.run("node", ["scripts/verify-chain-06-invoice-ar-chain-proof.mjs"]) !== 0) {
      process.exit(1);
    }
    if (ctx.run("node", ["scripts/verify-chain-06-invoice-ar-chain-proof.mjs", "--selftest"]) !== 0) {
      process.exit(1);
    }
  },
};
