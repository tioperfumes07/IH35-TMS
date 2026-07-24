// The PR-body evidence guard runs in CI against the live PR body
// (.github/workflows/pr-evidence-block.yml). Its ASSERTIONS still belong in the verify suite so the
// guard cannot rot unnoticed between PRs — the selftest proves it is still capable of failing.
export default {
  name: "check:pr-evidence-body",
  run(ctx) {
    return ctx.run("node", ["scripts/check-pr-evidence-body.mjs", "--selftest"]);
  },
};
