export default {
  name: "verify:escrow-ledger-fk-canonical",
  run(ctx) {
    ctx.run("node", ["scripts/verify-escrow-ledger-fk-canonical.mjs"]);
  },
};
