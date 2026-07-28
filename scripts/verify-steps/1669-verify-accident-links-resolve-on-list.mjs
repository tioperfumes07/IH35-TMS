/** SAF-B25 — a link the accident creator captures but the list cannot read back is a stored value nobody can use. */
export default {
  name: "verify-accident-links-resolve-on-list",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-accident-links-resolve-on-list.mjs"]);
    await ctx.run("node", ["scripts/verify-accident-links-resolve-on-list.mjs", "--selftest"]);
  },
};
