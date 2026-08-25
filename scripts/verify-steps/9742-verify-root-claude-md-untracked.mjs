export default {
  name: "verify-root-claude-md-untracked",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-root-claude-md-untracked.mjs"]) !== 0) {
      throw new Error("verify-root-claude-md-untracked failed");
    }
  },
};
