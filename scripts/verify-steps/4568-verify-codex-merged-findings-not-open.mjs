export default {
  name: "verify:codex-merged-findings-not-open",
  run(ctx) {
    ctx.run("node", ["scripts/verify-codex-merged-findings-not-open.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-codex-merged-findings-not-open.mjs"]);
  },
};
