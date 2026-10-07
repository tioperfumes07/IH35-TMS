export default {
  name: "verify:relay-wallet-bank-feed",
  run(ctx) {
    ctx.run("node", ["scripts/verify-relay-wallet-bank-feed.mjs"]);
    // RELAY-F442 — sender_fee → wallet drawdown + Fuel Card Fee leg (piggyback EVEN 12375).
    ctx.run("node", ["scripts/verify-relay-f442-sender-fee.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-relay-f442-sender-fee.mjs"]);
  },
};
