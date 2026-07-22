export default {
  name: "verify-drivers-active-path",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-drivers-active-path.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-drivers-active-path.mjs"]);
  },
};
