export default {
  name: "verify:safety-f22-orphan-nav-reachability",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-f22-orphan-nav-reachability.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-safety-f22-orphan-nav-reachability.mjs"]);
  },
};
