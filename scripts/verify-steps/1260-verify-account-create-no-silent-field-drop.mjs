export default {
  name: "verify-account-create-no-silent-field-drop",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-account-create-no-silent-field-drop.mjs"]) !== 0) return 1;
    return ctx.run("node", ["scripts/verify-account-create-no-silent-field-drop.mjs", "--selftest"]);
  },
};
