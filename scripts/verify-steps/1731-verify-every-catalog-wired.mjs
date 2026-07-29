// Step 1731 — COMPLETENESS GATE: every wireable catalogs.* table must have backend route + hub tile
// + resolvable route. Fails until the orphan/lie-live count is 0. Dynamic: the table list comes from
// the classified inventory, never a hardcoded list here.
export default {
  name: "verify:every-catalog-wired",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-every-catalog-wired.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-every-catalog-wired.mjs"]);
  },
};
