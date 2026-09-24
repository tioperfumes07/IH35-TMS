/**
 * ROUND 143.2 — wires scripts/verify-no-document-without-a-ledger.mjs into CI.
 * Live guard — requires DATABASE_URL for document + postings live check.
 */
export default {
  name: "verify-no-document-without-a-ledger",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-document-without-a-ledger.mjs"]);
  },
};
