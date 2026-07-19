export default {
  name: "verify-source-lineage-page-onerror",
  run(ctx) {
    // Rule 18: _runner.mjs's runStep() does `await run()` and does NOT check a
    // returned status code (verified empirically) — a `return 1` here is silently
    // discarded and verify:pre-commit prints PASS anyway. Match the safe pattern
    // used by verify-steps/907 and /909: throw so the failure actually propagates
    // through runStep and fails `npm run verify:pre-commit` (CI's build-typecheck).
    if (ctx.run("node", ["scripts/verify-source-lineage-page-onerror.mjs"]) !== 0) {
      throw new Error("verify-source-lineage-page-onerror failed");
    }
    if (ctx.run("node", ["scripts/verify-source-lineage-page-onerror.mjs", "--selftest"]) !== 0) {
      throw new Error("verify-source-lineage-page-onerror selftest failed");
    }
  },
};
