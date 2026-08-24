export default {
  name: "verify-safety-accidents-wire-up",
  run: async (ctx) => {
    await ctx.run("node", ["scripts/verify-safety-accidents-wire-up.mjs"]);
    await ctx.run("node", ["scripts/verify-safety-accidents-wire-up.mjs", "--selftest"]);
  },
};
