export default {
  name: "verify-chain-06-invoice-ar-chain-proof",
  run(ctx) {
    // Fail closed: nonzero child exit must terminate the step (Rule 18).
    // Step ID 920 is globally free vs origin/main and open PRs #2714/#2716/#2717 (those use 912/913).
    if (ctx.run("node", ["scripts/verify-chain-06-invoice-ar-chain-proof.mjs"]) !== 0) {
      process.exit(1);
    }
    if (ctx.run("node", ["scripts/verify-chain-06-invoice-ar-chain-proof.mjs", "--selftest"]) !== 0) {
      process.exit(1);
    }
  },
};
