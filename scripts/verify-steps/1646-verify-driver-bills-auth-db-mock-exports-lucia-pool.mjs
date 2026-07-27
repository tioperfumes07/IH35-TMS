/** ND-INV — driver-bills auth/db mock must export luciaPool. */
export default {
  name: "verify-driver-bills-auth-db-mock-exports-lucia-pool",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-driver-bills-auth-db-mock-exports-lucia-pool.mjs"]);
    await ctx.run("node", ["scripts/verify-driver-bills-auth-db-mock-exports-lucia-pool.mjs", "--selftest"]);
  },
};
