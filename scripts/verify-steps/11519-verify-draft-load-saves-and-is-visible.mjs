// 443.101: the fixture-writing real-Postgres round-trip runs here, on the fresh CI database (--db-test). The guard's
// live USMCA half runs in the live-DB job (ci.yml required-live-load-guard) — never a fixture against production.
export default {
  name: "verify-draft-load-saves-and-is-visible",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-draft-load-saves-and-is-visible.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-draft-load-saves-and-is-visible.mjs", "--db-test"]);
  },
};
