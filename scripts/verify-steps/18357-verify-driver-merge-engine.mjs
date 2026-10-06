export default {
  name: "verify:driver-merge-engine",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-merge-engine.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-merge-engine.mjs"]);
  },
};
