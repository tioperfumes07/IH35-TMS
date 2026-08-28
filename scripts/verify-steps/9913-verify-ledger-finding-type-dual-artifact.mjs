export default {
  name: "verify:ledger-finding-type-dual-artifact",
  run(ctx) {
    ctx.run("node", ["scripts/verify-ledger-finding-type-dual-artifact.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-ledger-finding-type-dual-artifact.mjs"]);
  },
};
