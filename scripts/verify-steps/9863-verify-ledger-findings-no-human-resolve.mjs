export default {
  name: "verify:ledger-findings-no-human-resolve",
  run(ctx) {
    ctx.run("node", ["scripts/verify-ledger-findings-no-human-resolve.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-ledger-findings-no-human-resolve.mjs"]);
  },
};
