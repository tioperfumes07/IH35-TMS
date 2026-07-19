export default {
  name: "verify-chain-06-ar-subledger-fix",
  run(ctx) {
    // Rule 17: auto-discover existing static CONN-2 / CHAIN-06 §5 guard (was package.json-only orphan).
    if (ctx.run("node", ["scripts/verify-chain-06-ar-subledger-fix.mjs"]) !== 0) {
      process.exit(1);
    }
  },
};
