/** react-plaid-link v5 — onSuccess public_token is string | null. */
export default {
  name: "verify-react-plaid-link-v5-onsuccess-null",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-react-plaid-link-v5-onsuccess-null.mjs"]);
    await ctx.run("node", ["scripts/verify-react-plaid-link-v5-onsuccess-null.mjs", "--selftest"]);
  },
};
