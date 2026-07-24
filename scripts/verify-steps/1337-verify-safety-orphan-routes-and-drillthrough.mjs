export default {
  name: "verify:safety-orphan-routes-and-drillthrough",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-orphan-routes-and-drillthrough.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-safety-orphan-routes-and-drillthrough.mjs"]);
  },
};
