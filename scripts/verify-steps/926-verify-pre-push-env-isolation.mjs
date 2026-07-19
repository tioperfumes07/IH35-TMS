export default {
  name: "verify-pre-push-env-isolation",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-pre-push-env-isolation.mjs"]) !== 0) {
      throw new Error("verify-pre-push-env-isolation failed");
    }
    if (ctx.run("node", ["scripts/verify-pre-push-env-isolation.mjs", "--selftest"]) !== 0) {
      throw new Error("verify-pre-push-env-isolation --selftest failed");
    }
    // Behavioral proof is the live gate — run the branch:precheck-push suite UNCONDITIONALLY
    // (Rule 18). The old IH35_PRE_PUSH_ENV_ISOLATION_RUN_TESTS gate meant CI never ran them:
    // a fake-green. This step is executed by verify:pre-commit (CI build-typecheck) so the
    // real pg identity probe + closed env-bypass assertions are proven every run.
    if (
      ctx.run("node", ["--test", "scripts/__tests__/branch-precheck-push.test.mjs"]) !== 0
    ) {
      throw new Error("branch-precheck-push behavioral tests failed");
    }
  },
};
