const SCRIPT = "scripts/verify-wave-h2-writepath-live-proof.mjs";
export default {
  name: "verify:wave-h2-writepath-live-proof",
  run(ctx) {
    ctx.run("node", [SCRIPT, "--selftest"]);
    ctx.run("node", [SCRIPT]);
  },
};
