/**
 * ROUND E23 — wires scripts/verify-costs-are-expenses-not-handwritten-jes.mjs (the guard that
 * fails handwritten cost JEs and wrong credit accounts) into CI. Live guard — requires
 * DATABASE_URL; runs in the live verify-step band.
 */
export default {
  name: "verify-costs-are-expenses-not-handwritten-jes",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-costs-are-expenses-not-handwritten-jes.mjs"]);
  },
};
