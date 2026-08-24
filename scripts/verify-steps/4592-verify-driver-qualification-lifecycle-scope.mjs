export default {
  name: "verify:driver-qualification-lifecycle-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-qualification-lifecycle-scope.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-qualification-lifecycle-scope.mjs"]);
  },
};
