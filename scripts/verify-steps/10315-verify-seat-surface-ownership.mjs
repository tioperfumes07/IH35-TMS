/** CC-2 — §0b SEAT SURFACE OWNERSHIP (owner-dictated 2026-09-04, verbatim table). Fails a PR when
 * a commit touches a path outside the author seat's surface unless the commit body carries
 * SURFACE-BREACH-AUTHORIZED: <owning seat> <reason>. Cited for weeks as the enforcement mechanism
 * in the law doc and 4 bus docs; 0 files implemented it and CODEOWNERS carries no per-seat mapping
 * (8 notify-only paths) — this guard is that enforcement, wired in the same PR that adds it so it
 * is never an orphaned guard (the exact class this session already fixed once, #20307). */
export default {
  name: "verify-seat-surface-ownership",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-seat-surface-ownership.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-seat-surface-ownership.mjs"]);
  },
};
