export default {
  name: "verify:banking-escrow-register-settlement-je-link",
  run(ctx) {
    ctx.run("node", ["scripts/verify-banking-escrow-register-settlement-je-link.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-banking-escrow-register-settlement-je-link.mjs"]);
  },
};
