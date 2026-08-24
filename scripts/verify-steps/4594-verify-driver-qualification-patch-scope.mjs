export default {
  name: "verify:driver-qualification-patch-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-qualification-patch-scope.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-qualification-patch-scope.mjs"]);
  },
};
