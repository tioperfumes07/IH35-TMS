// DRIVER-CASH-ADVANCE-ESCROW-PAIR-INVARIANT (owner-locked L114). Step 10165 · CC-1 lane.
export default {
  name: "driver-account-pair-invariant",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-account-pair-invariant.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-driver-account-pair-invariant.mjs"]);
  },
};
