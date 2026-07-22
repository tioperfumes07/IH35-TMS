export default {
  name: "verify-safety-active-path",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-active-path.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-safety-active-path.mjs"]);
  },
};
