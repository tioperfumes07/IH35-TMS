// Permanent manifest arithmetic + complete:true integrity (Rule 24 companion).
// FAIL if progress ≠ pass_count/total_count, or complete:true with open items / N < M.
export default {
  name: "verify:module-manifest-integrity",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-module-manifest-integrity.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-module-manifest-integrity.mjs"]);
  },
};
