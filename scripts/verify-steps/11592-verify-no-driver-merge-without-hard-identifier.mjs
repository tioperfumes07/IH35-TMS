/**
 * ROUND E23 — wires scripts/verify-no-driver-merge-without-hard-identifier.mjs (Q16,
 * the driver-merge hard-identifier guard) into CI. Live guard — requires DATABASE_URL.
 */
export default {
  name: "verify-no-driver-merge-without-hard-identifier",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-driver-merge-without-hard-identifier.mjs"]);
  },
};
