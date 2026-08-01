const SCRIPT = "scripts/verify-driver-pwa-vitest.mjs";
export default {
  name: "verify:driver-pwa-vitest",
  run(ctx) {
    ctx.run("node", [SCRIPT, "--selftest"]);
    ctx.run("node", [SCRIPT]);
  },
};
