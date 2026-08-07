// Rule 17: verify-steps ONLY — never edit package.json / ci.yml for wiring.
export default {
  name: "verify-claude-settings-hard-deny",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-claude-settings-hard-deny.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-claude-settings-hard-deny.mjs"]);
  },
};
