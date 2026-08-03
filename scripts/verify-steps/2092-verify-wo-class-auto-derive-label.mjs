export default {
  name: "verify-wo-class-auto-derive-label",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-wo-class-auto-derive-label.mjs"]);
    ctx.run("node", ["scripts/verify-wo-class-auto-derive-label.mjs", "--selftest"]);
  },
};
