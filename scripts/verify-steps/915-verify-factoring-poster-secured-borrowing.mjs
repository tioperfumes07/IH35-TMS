export default {
  name: "verify-factoring-poster-secured-borrowing",
  run(ctx) {
    // Rule 17: auto-discover the existing secured-borrowing per-leg contract (was CI-orphan / exempt).
    if (ctx.run("node", ["scripts/verify-factoring-poster-secured-borrowing.mjs"]) !== 0) {
      process.exit(1);
    }
    if (ctx.run("node", ["scripts/verify-factoring-poster-secured-borrowing.mjs", "--self-test"]) !== 0) {
      process.exit(1);
    }
  },
};
