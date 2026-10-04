export default {
  name: "verify:ledger-parity-static",
  run(ctx) {
    ctx.run("node", ["scripts/verify-ledger-parity-static.mjs"]);
  },
};
