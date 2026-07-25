export default {
  name: "verify:held-registry-ledger-parity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-held-registry-ledger-parity.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-held-registry-ledger-parity.mjs"]);
  },
};
