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

    // LAW-2026-08-07-VERTICAL-METHOD — the owner's permanent method, now enforced rather than merely
    // written. Work is drained VERTICALLY by CLASS, globally and universally: never module-by-module,
    // never the old block way. It was ALREADY stated in all four lane standing orders and a lane still
    // reverted, which is the whole argument for a guard: prose is followed only while someone
    // remembers it. Presence ratchet, sub-second, same pattern as the standing-directive check.
    // It does NOT judge whether a given PR is vertical — that is judgment, and judgment rules stay
    // judgment rather than being force-guarded into noise.
    await ctx.run("node", ["scripts/verify-vertical-method-law-present.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-vertical-method-law-present.mjs"]);
  },
};
