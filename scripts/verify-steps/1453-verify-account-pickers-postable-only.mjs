export default {
  name: "verify-account-pickers-postable-only",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-account-pickers-postable-only.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-account-pickers-postable-only.mjs"]);
  },
};
