// Step 1834 — Relay fuel driver match phone/name unique fallbacks + rematch route.
// Rule 17: verify-steps ONLY — never edit package.json / ci.yml / locked-guards.
export default {
  name: "verify-relay-fuel-driver-match-fallbacks",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-relay-fuel-driver-match-fallbacks.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-relay-fuel-driver-match-fallbacks.mjs"]);
  },
};
