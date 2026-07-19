export default {
  name: "verify-chain-06-factoring-ar-tieout",
  run(ctx) {
    // Rule 17: auto-discover existing read-only Leg B/C tie-out (was package.json-only orphan).
    // Degrade-safe without DATABASE_URL (exit 0). Advisory unless CHAIN_06_TIEOUT_ENFORCE=true.
    if (ctx.run("node", ["scripts/verify-chain-06-factoring-ar-tieout.mjs"]) !== 0) {
      process.exit(1);
    }
  },
};
