/**
 * Step 1230 — verify-push-gate-conflict-markers.
 * Locks the pre-push conflict guard in BOTH directions: it must keep detecting a genuinely
 * interrupted merge/rebase/cherry-pick, and it must not fire on git's post-rebase REBASE_HEAD
 * leftover (a false positive that failed every push after any rebase and pushes authors toward
 * --no-verify, which is how a real gate stops being trusted).
 */
export default {
  name: "verify:push-gate-conflict-markers",
  run(ctx) {
    ctx.run("node", ["scripts/verify-push-gate-conflict-markers.mjs"]);
  },
};
