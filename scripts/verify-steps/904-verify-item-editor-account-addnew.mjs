export default {
  name: "verify-item-editor-account-addnew",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-item-editor-account-addnew.mjs"]) !== 0) {
      return 1;
    }
    return ctx.run("node", ["scripts/verify-item-editor-account-addnew.mjs", "--selftest"]);
  },
};
