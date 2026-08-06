// 1554-verify-ci-checkout-depth-for-range-guards — the environment half of the 1430 fake-green fix.
//
// verify-step 1430 (verify-no-money-theater) now REFUSES to report success on an unusable commit
// range. That is only half the fix: the reason the range was unusable is that `actions/checkout`
// defaults to `fetch-depth: 1`, and the job that actually runs the money gate had no `fetch-depth`
// at all. This step keeps every CI job that invokes a range-resolving guard on full history, so the
// gates can never quietly return to inspecting zero commits.
// SHARES THIS STEP: verify-ci-concurrency-sha-scoped (2026-08-06). Same class exactly — both guards
// police `.github/workflows/*` integrity so a CI gate cannot silently stop gating: 1554 keeps
// range-resolving guards on full history, and the concurrency guard keeps a queued-but-unstarted run
// from being cancelled into a permanently dead required check.
//
// It rides here rather than in its own numbered step because Rule 37 requires a verify-step number to
// be on origin/main BEFORE the step file is authored, and its reserved number (2753) is still in the
// unmerged claim PR #4611. The alternative was scripts/.guard-exempt.json, which would mean the guard
// does not run at all — and LAW §2 is that an unenforced rule is not law. Wiring it here makes it
// enforced on every PR today; it moves to 2753 once the claim lands.
export default {
  name: "verify-ci-checkout-depth-for-range-guards",
  run(ctx) {
    ctx.run("node", ["scripts/verify-ci-checkout-depth-for-range-guards.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-ci-checkout-depth-for-range-guards.mjs"]);
    ctx.run("node", ["scripts/verify-ci-concurrency-sha-scoped.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-ci-concurrency-sha-scoped.mjs"]);
  },
};
