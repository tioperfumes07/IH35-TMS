const SCRIPT = "scripts/verify-safety-hos-violations-driver-picker.mjs";
export default {
  name: "verify:safety-hos-violations-driver-picker",
  run(ctx) {
    ctx.run("node", [SCRIPT, "--selftest"]);
    return ctx.run("node", [SCRIPT]);
  },
};
