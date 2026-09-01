// 10206-verify-healthz-exposes-sha — HEALTH-NO-SHA-01.
//
// GET /api/v1/healthz must expose commit SHA + build timestamp (version, git_sha, built_at),
// not checks-only. Wired into the verify-steps runner (locked-guards / verify:pre-commit) so
// CI names this requirement: healthz must expose the SHA.
export default {
  name: "verify-healthz-exposes-sha",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-healthz-exposes-sha.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-healthz-exposes-sha.mjs"]);
  },
};
