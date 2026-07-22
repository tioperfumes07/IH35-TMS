export default {
  name: "verify-chain-04-bill-payment-bank-tieout",
  run(ctx) {
    // Rule 17: auto-discover existing CHAIN-04 read-only tie-out proof (was package.json-only orphan).
    // Advisory by default (no DATABASE_URL → skip exit 0). Set CHAIN_04_TIEOUT_ENFORCE=true to block.
    // Does NOT build Part 2b accept-bill write path — that remains HOLD-FOR-JORGE.
    if (ctx.run("node", ["scripts/verify-chain-04-bill-payment-bank-tieout.mjs"]) !== 0) {
      process.exit(1);
    }
  },
};
