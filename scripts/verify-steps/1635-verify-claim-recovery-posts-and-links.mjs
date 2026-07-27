/** INS-02 — claim recovery posts JE and links to claim (flag OFF default). */
export default {
  name: "verify-claim-recovery-posts-and-links",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-claim-recovery-posts-and-links.mjs"]);
    await ctx.run("node", ["scripts/verify-claim-recovery-posts-and-links.mjs", "--selftest"]);
  },
};

