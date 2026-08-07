// CONN-3 Part B — every Relay-using entity needs its own wallet account + RELAY-* items
// (verify-step 2521 · CC-1 lane n%4==1, claimed on main by #4328).
export default {
  name: "relay-wallet-entity-parity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-relay-wallet-entity-parity.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-relay-wallet-entity-parity.mjs"]);
  },
};
