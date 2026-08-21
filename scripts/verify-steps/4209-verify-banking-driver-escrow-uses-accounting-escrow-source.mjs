export default {
  name: "verify:banking-driver-escrow-uses-accounting-escrow-source",
  run(ctx) {
    ctx.run("node", ["scripts/verify-banking-driver-escrow-uses-accounting-escrow-source.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-banking-driver-escrow-uses-accounting-escrow-source.mjs"]);
  },
};
