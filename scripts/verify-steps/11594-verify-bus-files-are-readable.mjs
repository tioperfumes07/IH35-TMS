/**
 * ROUND E23 — wires scripts/verify-bus-files-are-readable.mjs (Q34, the bus channel
 * 4KB cap + 48h staleness guard) into CI. Static, no DATABASE_URL needed.
 */
export default {
  name: "verify-bus-files-are-readable",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bus-files-are-readable.mjs"]);
  },
};
