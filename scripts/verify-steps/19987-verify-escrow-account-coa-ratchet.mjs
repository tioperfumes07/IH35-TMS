export default {
  name: "verify:escrow-account-coa-ratchet",
  run(ctx) {
    ctx.run("node", ["scripts/verify-escrow-account-coa-ratchet.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-escrow-account-coa-ratchet.mjs"]);
  },
};
