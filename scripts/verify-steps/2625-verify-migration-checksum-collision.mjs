// verify-migration-checksum-collision — LV-087: block renumber-and-reapply of identical DDL.
// Prod carries 4 duplicate-checksum ledger pairs; they were harmless only because their SQL happened
// to be idempotent. The selftest runs first so a stale guard fails loudly instead of passing vacuously.
export default {
  name: "verify:migration-checksum-collision",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-migration-checksum-collision.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-migration-checksum-collision.mjs"]);
  },
};
