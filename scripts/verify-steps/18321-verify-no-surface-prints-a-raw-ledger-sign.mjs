export default {
  name: "verify:no-surface-prints-a-raw-ledger-sign",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-surface-prints-a-raw-ledger-sign.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-no-surface-prints-a-raw-ledger-sign.mjs"]);
  },
};
