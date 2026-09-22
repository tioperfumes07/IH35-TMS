/**
 * verify:guard-wired fix (PR #22164) — verify-no-silent-db-skip.mjs (ROUND 29.9-B owner ruling, the
 * "silent-skip-as-fake-green" ratchet) existed and ran in money-pr-local-gate.mjs (03d) but was
 * never wired into a claimed verify-step, so it never independently ran in CI. Wraps it into the CI
 * verify-step convention (verify-step 11537, CC-1 band, CLAIM-RESERVE PR #22165).
 *
 * Runs unconditionally with no DATABASE_URL requirement of its own (it deletes DATABASE_URL from
 * the env of every scripts/verify-*.mjs it dynamically re-spawns) — safe in CI regardless of
 * whatever DATABASE_URL the job happens to carry.
 */
export default {
  name: "verify-no-silent-db-skip",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-silent-db-skip.mjs"]);
  },
};
