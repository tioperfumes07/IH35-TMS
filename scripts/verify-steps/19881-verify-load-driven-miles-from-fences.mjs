// ENG-34 / batch70 — wire orphan verify-load-driven-miles-from-fences.
// CI runs --selftest only: proves shrinkFails ceiling (≤149 pass / 150 fail / 0 pass).
// The LIVE measure half REQUIRES_LIVE_DB (money-pr via e7-batch2-live-guards.json / manual);
// CI has no prod DATABASE_URL, so the full path stays money-pr only.
export default {
  name: "verify:verify-load-driven-miles-from-fences",
  run(ctx) {
    ctx.run("node", [
      "scripts/verify-load-driven-miles-from-fences.mjs",
      "--selftest",
    ]);
  },
};
