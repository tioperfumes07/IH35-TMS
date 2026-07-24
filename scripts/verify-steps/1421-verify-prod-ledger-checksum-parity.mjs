export default {
  name: "verify:prod-ledger-checksum-parity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-prod-ledger-checksum-parity.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-prod-ledger-checksum-parity.mjs"]);
  },
};
