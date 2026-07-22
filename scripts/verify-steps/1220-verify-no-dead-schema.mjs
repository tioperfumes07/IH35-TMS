/**
 * Step 1220 — verify-no-dead-schema.
 * Enforces CLAUDE.md §10a (Total Connectivity): a column or table created by a migration that NO
 * non-test source file reads is dead schema — it implies a feature that does not exist.
 * This is the guard the linkage law was missing; without it agents substitute "CI green" and
 * "file present on main" for actual wiring proof.
 */
export default {
  name: "verify:no-dead-schema",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-dead-schema.mjs"]);
  },
};
