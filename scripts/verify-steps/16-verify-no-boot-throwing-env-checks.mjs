export default {
  name: "verify-no-boot-throwing-env-checks",
  run: async (ctx) => {
    await ctx.run("node", ["scripts/verify-no-boot-throwing-env-checks.mjs", "--selftest"]);
    await ctx.run("npm", ["run", "verify:no-boot-throwing-env-checks"]);
  },
};
