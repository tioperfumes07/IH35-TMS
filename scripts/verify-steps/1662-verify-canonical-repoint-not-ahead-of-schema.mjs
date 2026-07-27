/** RED BY DESIGN — code querying tables that only a still-HELD migration creates must refuse, not 42P01. */
export default {
  name: "verify-canonical-repoint-not-ahead-of-schema",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-canonical-repoint-not-ahead-of-schema.mjs"]);
    await ctx.run("node", ["scripts/verify-canonical-repoint-not-ahead-of-schema.mjs", "--selftest"]);
  },
};
