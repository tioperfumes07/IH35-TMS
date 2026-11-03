export default {
  name: "verify:escrow-ledger-sign-follows-type",
  run(ctx) {
    ctx.run("node", ["scripts/verify-escrow-ledger-sign-follows-type.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-escrow-ledger-sign-follows-type.mjs"]);
  },
};
