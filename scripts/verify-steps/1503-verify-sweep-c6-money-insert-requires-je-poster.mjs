// 1503-verify-sweep-c6-money-insert-requires-je-poster — SWEEP-C6 (owner STOP-AND-ALIGN 2026-07-25).
// Guard-first: selftest fails on planted no-poster money writes; live tree uses shrink-only baseline.
// Wired ONLY here (Rule 17). No package.json / locked-guards.yml edits.
// Fold #3551 fine-GL + SAF-B18 into C6 — do not merge solo money-poster PRs until this guard is on main.
export default {
  name: "verify-sweep-c6-money-insert-requires-je-poster",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-sweep-c6-money-insert-requires-je-poster.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-sweep-c6-money-insert-requires-je-poster.mjs"]);
  },
};
