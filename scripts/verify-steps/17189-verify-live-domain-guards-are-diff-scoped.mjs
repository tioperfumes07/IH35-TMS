export default {
  name: "verify:live-domain-guards-are-diff-scoped",
  run(ctx) {
    ctx.run("node", ["scripts/verify-live-domain-guards-are-diff-scoped.mjs"]);
  },
};
