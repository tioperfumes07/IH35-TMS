// Step 2000 — G18 fuel load_id rematch via resolveLoadId (fill-null only).
// Rule 17: verify-steps ONLY — never edit package.json / ci.yml / CLAIMED-NUMBERS.json.
export default {
  name: "verify-fuel-g18-load-link-rematch",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fuel-g18-load-link-rematch.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-fuel-g18-load-link-rematch.mjs"]);
  },
};
