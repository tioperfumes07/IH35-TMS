export default {
  name: "verify:dispatcher-safety-events-write-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatcher-safety-events-write-scope.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-dispatcher-safety-events-write-scope.mjs"]);
  },
};
