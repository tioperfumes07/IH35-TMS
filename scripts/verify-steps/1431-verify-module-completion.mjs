export default {
  name: "verify-module-completion",
  run(ctx) {
    ctx.run("node", ["scripts/verify-module-completion.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-module-completion.mjs"]);
  },
};
