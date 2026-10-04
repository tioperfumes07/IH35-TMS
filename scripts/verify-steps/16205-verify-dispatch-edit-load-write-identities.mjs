export default {
  name: "verify:dispatch-edit-load-write-identities",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-edit-load-write-identities.mjs"]);
  },
};
