const SCRIPT = "scripts/verify-route-file-mounted.mjs";
export default {
  name: "verify:route-file-mounted",
  run(ctx) {
    ctx.run("node", [SCRIPT, "--selftest"]);
    ctx.run("node", [SCRIPT]);
  },
};
