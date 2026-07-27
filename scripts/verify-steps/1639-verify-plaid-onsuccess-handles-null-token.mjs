/** react-plaid-link v5 can return a null public_token — both handlers must refuse, never cast. */
export default {
  name: "verify-plaid-onsuccess-handles-null-token",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-plaid-onsuccess-handles-null-token.mjs"]);
    await ctx.run("node", ["scripts/verify-plaid-onsuccess-handles-null-token.mjs", "--selftest"]);
  },
};
