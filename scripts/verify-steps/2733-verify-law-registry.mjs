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

    // LAW-2026-08-07-GUARD-MUST-RUN — the registry above proves an enforced law's guard RESOLVES ON
    // DISK. It does not prove the guard RUNS. Found independently by CC-3: a guard can be registered,
    // sit in .guard-exempt.json, be referenced by no step and no workflow, and still report enforced —
    // a green tick over nothing, which reads as protected and is worse than a visibly unguarded law.
    // 21 laws were in exactly that state (13 exempt, 8 orphaned), so it ships shrink-only.
    await ctx.run("node", ["scripts/verify-law-guard-actually-runs.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-law-guard-actually-runs.mjs"]);
  },
};
