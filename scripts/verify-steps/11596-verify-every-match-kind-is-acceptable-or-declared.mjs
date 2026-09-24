/**
 * ROUND 141.4 — wires scripts/verify-every-match-kind-is-acceptable-or-declared.mjs into CI.
 * Live guard — requires DATABASE_URL for CHECK constraint + bank_transactions columns.
 */
export default {
  name: "verify-every-match-kind-is-acceptable-or-declared",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-every-match-kind-is-acceptable-or-declared.mjs"]);
  },
};
