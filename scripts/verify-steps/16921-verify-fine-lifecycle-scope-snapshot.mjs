export default {
  name: "verify:fine-lifecycle-scope-snapshot",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fine-lifecycle-scope-snapshot.mjs"]);
  },
};
