// verify-board-append-only — the findings board is APPEND-ONLY and a completion must cite its evidence.
//
// docs/audit/GUARD-WORKORDERS.md is append-only BY LAW (Rule 28: supersede, never delete) and nothing
// enforced it. Two independent failure modes hit real PRs on 2026-08-08, both caught only because a
// human happened to read a numstat line:
//   A. SILENT DELETION — six near-misses in one day. #4752 alone would have removed the
//      MIGRATION-NUMBER-RACE row (0 additions / 50 deletions); an earlier sync would have taken CC-2's
//      P0 CI-ACTIONS-DEAD row. The diffs look ordinary; only a net-negative row count gives it away.
//   B. FAKE COMPLETION — #4724 would have written "DRAINED" crediting a service file that does not
//      exist on main. That row ADDED lines, so a deletion-only check waves it through. A board row
//      outlives the PR that wrote it, which makes this the more durable defect.
//
// Check B is a RATCHET, not an absolute: 9 pre-existing completion rows cite nothing, and a
// permanently-red guard gets muted. Freeze what exists, fail what is NEW.
//
// Selftest first — it plants both defects and demands RED.
export default {
  name: "verify:board-append-only",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-board-append-only.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-board-append-only.mjs"]);
  },
};
