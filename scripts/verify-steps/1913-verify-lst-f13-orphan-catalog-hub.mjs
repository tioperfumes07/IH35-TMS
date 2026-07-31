const SCRIPT = "scripts/verify-lst-f13-orphan-catalog-hub.mjs";

export default {
  name: "verify:lst-f13-orphan-catalog-hub",
  run(ctx) {
    ctx.run("node", [SCRIPT, "--selftest"]);
    ctx.run("node", [SCRIPT]);
  },
};
