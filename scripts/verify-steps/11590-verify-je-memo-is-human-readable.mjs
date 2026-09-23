/**
 * ROUND E23 — wires scripts/verify-je-memo-is-human-readable.mjs (guard 45, the JE memo
 * human-readability check including bare-UUID rejection) into CI. Live guard — requires
 * DATABASE_URL; runs in the live verify-step band.
 */
export default {
  name: "verify-je-memo-is-human-readable",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-je-memo-is-human-readable.mjs"]);
  },
};
