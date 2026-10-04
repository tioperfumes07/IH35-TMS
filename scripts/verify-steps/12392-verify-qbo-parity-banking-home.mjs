export default {
  name: "verify:qbo-parity-banking-home",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-parity-banking-home.mjs"]);
    // BANK-F91436 — C-51 / C-64 banking Home + Driver Escrow ops pack (never ran in CI).
    ctx.run("node", ["scripts/ops/verify-c51-banking-home-escrow.mjs", "--selftest"]);
  },
};
