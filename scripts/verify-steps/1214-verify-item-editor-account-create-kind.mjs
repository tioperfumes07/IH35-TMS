export default {
  name: "verify-item-editor-account-create-kind",
  run(ctx) {
    ctx.run("node", ["scripts/verify-item-editor-account-create-kind.mjs"]);
    ctx.run("node", ["scripts/verify-item-editor-account-create-kind.mjs", "--selftest"]);
  },
};
