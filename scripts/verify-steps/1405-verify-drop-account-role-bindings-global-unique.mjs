export default {
  name: "verify-drop-account-role-bindings-global-unique",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-drop-account-role-bindings-global-unique.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-drop-account-role-bindings-global-unique.mjs"]);
  },
};
