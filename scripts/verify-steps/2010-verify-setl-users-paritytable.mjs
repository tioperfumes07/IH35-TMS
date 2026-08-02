// SETL-USR-PARITY — Settlements + Users primary list tables → ParityTable (step 2010).
export default {
  name: "verify:setl-users-paritytable",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-setl-users-paritytable.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-setl-users-paritytable.mjs"]);
  },
};
