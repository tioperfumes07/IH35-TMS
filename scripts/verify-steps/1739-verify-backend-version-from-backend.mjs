// Step 1739 — a "Backend version" label must be read from the backend (/api/v1/healthz/shallow),
// never from a frontend build-time constant. Prod showed "not available" on every Home load.
export default {
  name: "verify:backend-version-from-backend",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-backend-version-from-backend.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-backend-version-from-backend.mjs"]);
  },
};
