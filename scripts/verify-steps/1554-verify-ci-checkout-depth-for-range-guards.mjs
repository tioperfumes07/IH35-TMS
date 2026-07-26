// 1554-verify-ci-checkout-depth-for-range-guards — the environment half of the 1430 fake-green fix.
//
// verify-step 1430 (verify-no-money-theater) now REFUSES to report success on an unusable commit
// range. That is only half the fix: the reason the range was unusable is that `actions/checkout`
// defaults to `fetch-depth: 1`, and the job that actually runs the money gate had no `fetch-depth`
// at all. This step keeps every CI job that invokes a range-resolving guard on full history, so the
// gates can never quietly return to inspecting zero commits.
export default {
  name: "verify-ci-checkout-depth-for-range-guards",
  run(ctx) {
    ctx.run("node", ["scripts/verify-ci-checkout-depth-for-range-guards.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-ci-checkout-depth-for-range-guards.mjs"]);
  },
};
