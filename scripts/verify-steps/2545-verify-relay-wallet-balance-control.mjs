// CONN-3 — the Relay wallet is carried as an ASSET so its balance can be PROVED against Relay's
// reported balance; the control must stay read-only and threshold-free. Step 2545 · CC-1 lane.
export default {
  name: "relay-wallet-balance-control",
  run(ctx) {
    ctx.run("node", ["scripts/verify-relay-wallet-balance-control.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-relay-wallet-balance-control.mjs"]);
  },
};
