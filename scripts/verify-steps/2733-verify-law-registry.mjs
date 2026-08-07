// PERMANENT LAW (owner-locked 2026-08-05) §2 — "LAW = ENFORCED GUARD, OR IT IS NOT LAW".
// Existence-only registry check over docs/law/LAW.json: every law registered as type='enforced' must
// name a guard file that resolves on disk. ~0.5s including the selftest, so it can be required on
// every PR without adding measurable PR time — which is what the law itself specifies.
// The selftest runs FIRST and is the proof the check CAN go red: it plants an enforced law pointing at
// a non-existent guard, asserts exit 1 naming the (id, guard) pair, then restores and asserts exit 0.
export default {
  name: "verify-law-registry",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-law-registry.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-law-registry.mjs"]);

    // CLS-GUARD-PHANTOM — the same existence law, applied to the CLASS QUEUE. docs/audit/wave-queue.json
    // names, per wave, the guard that holds its class drained; nothing verified those files existed and
    // 10 of 31 did not resolve. Two were on waves marked DRAINED, which is a drain claim nothing was
    // enforcing. (Both turned out to be STALE PATHS to real guards, not phantom guards — verified by
    // reading each target's header, which names its own class — but the queue had no way to tell the
    // difference, and that is the gap.) A drained wave with a missing guard is a HARD FAIL here; an open
    // wave still owing one is shrink-only debt. Existence-only, same cost profile as the law check above.
    await ctx.run("node", ["scripts/verify-wave-queue-guards-exist.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-wave-queue-guards-exist.mjs"]);

    // LAW-2026-08-07-LANE-TERRITORY — stop the lanes colliding, enforced rather than written.
    // Measured over 60 PRs: lanes do NOT collide on domain code (dispatch/mdata/frontend are CC-2
    // only; accounting/driver-finance/migrations/.github are CC-1 only). They collide on shared entry
    // points. Layer 1 keeps the clean partition clean; layer 1b serializes the handful of files that
    // genuinely belong to everyone. Append-only registries are deliberately excluded from BOTH — they
    // are union-merged, so filing a board finding never waits for a token. Both advisory outside a PR.
    await ctx.run("node", ["scripts/verify-lane-territory.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-lane-territory.mjs"]);
    await ctx.run("node", ["scripts/verify-hotfile-single-open-pr.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-hotfile-single-open-pr.mjs"]);
  },
};
