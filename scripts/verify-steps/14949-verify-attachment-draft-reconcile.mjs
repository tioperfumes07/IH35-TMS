export default {
  name: "verify:attachment-draft-reconcile",
  run(ctx) {
    ctx.run("node", ["scripts/verify-attachment-draft-reconcile.mjs"]);
  },
};
